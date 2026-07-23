import { describe, it, expect } from "vitest";
import {
  pickInterval,
  pickFeature,
  readSecurityFromPolicy,
  securityFormToPolicy,
  readManagedAppFromPolicy,
  managedAppFormToPolicy,
  readFormFromPolicy,
  formToPolicy,
  isEmptyPolicy,
  extractPolicyEnvelope,
} from "./policyTransforms";

const catalog = [
  { key: "amp", required: true },
  { key: "scp", impliesModule: "compliance" },
  { key: "pmp", impliesModule: "patch" },
  { key: "rcp", impliesModule: "remoteControl" },
];

describe("pickInterval", () => {
  it("prefers the v2 agent.schedules path over the v1 top-level path", () => {
    expect(pickInterval({ agent: { schedules: { inventory: { intervalSeconds: 120 } } }, inventory: { intervalSeconds: 300 } }, "inventory")).toBe(120);
  });
  it("falls back to the v1 top-level path", () => {
    expect(pickInterval({ compliance: { intervalSeconds: 600 } }, "compliance")).toBe(600);
  });
  it("returns NaN when unset", () => {
    expect(Number.isNaN(pickInterval({}, "patch"))).toBe(true);
  });
});

describe("pickFeature", () => {
  it("v2 agent.features wins, coerces to boolean", () => {
    expect(pickFeature({ agent: { features: { selfUpdate: 1 } }, features: { selfUpdate: false } }, "selfUpdate")).toBe(true);
  });
  it("returns null when unset (distinct from false)", () => {
    expect(pickFeature({}, "remoteShell")).toBeNull();
    expect(pickFeature({ features: { remoteShell: false } }, "remoteShell")).toBe(false);
  });
});

describe("security read/write round-trip", () => {
  it("reads defaults for an absent security block (empty capabilities)", () => {
    const form = readSecurityFromPolicy({});
    expect(form.defaultMode).toBe("report-only");
    expect(form.capabilities).toEqual({});
  });
  it("populates per-capability entries when a security block is present", () => {
    const form = readSecurityFromPolicy({ security: {} });
    // Present-but-empty security → each known capability gets a null-mode entry.
    expect(form.capabilities.firewall).toEqual({ mode: null, values: {} });
  });
  it("reads a configured capability and writes it back, omitting empties", () => {
    const policy = { security: { defaultMode: "auto", firewall: { mode: "auto", required: true } } };
    const form = readSecurityFromPolicy(policy);
    expect(form.defaultMode).toBe("auto");
    expect(form.capabilities.firewall).toEqual({ mode: "auto", values: { required: true } });

    const out = securityFormToPolicy(form);
    expect(out.defaultMode).toBe("auto");
    expect(out.firewall).toEqual({ mode: "auto", required: true });
  });
  it("returns null when nothing is configured", () => {
    const form = readSecurityFromPolicy({});
    expect(securityFormToPolicy(form)).toBeNull();
  });
});

describe("MAM managed-app read/write", () => {
  it("reads tri-state booleans and unset scalars, reading the iOS alias", () => {
    const form = readManagedAppFromPolicy({ managedApp: { requireAppPIN: true, idleTimeoutSeconds: 300 } });
    expect(form.requireAppPIN).toBe(true);
    expect(form.requireUserAuth).toBeNull();
    expect(form.idleTimeoutSeconds).toBe(300);
    expect(form.minimumAppVersion).toBe("");
  });
  it("writes only explicit fields and enforces the idle bounds", () => {
    expect(managedAppFormToPolicy({ requireAppPIN: true, idleTimeoutSeconds: 5, minimumAppVersion: " 1.2 " }))
      .toEqual({ requireAppPIN: true, minimumAppVersion: "1.2" }); // idle 5 < MAM_IDLE_MIN → dropped
    expect(managedAppFormToPolicy({})).toBeNull();
  });
});

describe("readFormFromPolicy", () => {
  it("derives plugin toggles from the catalog + enabled list, honoring required", () => {
    const form = readFormFromPolicy({ plugins: { enabled: ["scp"] } }, catalog);
    expect(form.plugins).toEqual({ amp: true, scp: true, pmp: false, rcp: false });
  });
  it("surfaces intervals only when finite/positive", () => {
    const form = readFormFromPolicy({ agent: { schedules: { inventory: { intervalSeconds: 120 } } } }, catalog);
    expect(form.inventory.intervalSeconds).toBe(120);
    expect(form.compliance.intervalSeconds).toBeNull();
  });
});

describe("formToPolicy", () => {
  it("derives modules from plugins and gates intervals by module", () => {
    const form = readFormFromPolicy({ plugins: { enabled: ["scp"] } }, catalog);
    form.inventory.intervalSeconds = 120;
    form.compliance.intervalSeconds = 600;
    form.patch.intervalSeconds = 600; // pmp not enabled → module.patch false → dropped
    const policy = formToPolicy(form, catalog);
    expect(policy.modules).toEqual({ compliance: true });
    expect(policy.inventory).toEqual({ intervalSeconds: 120 });
    expect(policy.compliance).toEqual({ intervalSeconds: 600 });
    expect(policy.patch).toBeUndefined();
  });
  it("drops out-of-range intervals", () => {
    const form = readFormFromPolicy({ plugins: { enabled: [] } }, catalog);
    form.inventory.intervalSeconds = 5; // < INVENTORY_INTERVAL_MIN (60)
    const policy = formToPolicy(form, catalog);
    expect(policy.inventory).toBeUndefined();
  });
  it("only emits RCP feature flags when the remoteControl module is on", () => {
    const withRcp = readFormFromPolicy({ plugins: { enabled: ["rcp"] } }, catalog);
    withRcp.features.remoteShell = true;
    expect(formToPolicy(withRcp, catalog).features).toEqual({ remoteShell: true });

    const noRcp = readFormFromPolicy({ plugins: { enabled: [] } }, catalog);
    noRcp.features.remoteShell = true; // rcp off → dropped
    expect(formToPolicy(noRcp, catalog).features).toBeUndefined();
  });
  it("emits AI and SDP blocks only for positive integer values", () => {
    const form = readFormFromPolicy({}, catalog);
    form.ai.enabled = true;
    form.ai.maxCallsPerDay = 100;
    form.sdp.bandwidthLimitKbps = 0; // dropped
    const policy = formToPolicy(form, catalog);
    expect(policy.ai).toEqual({ enabled: true, maxCallsPerDay: 100 });
    expect(policy.sdp).toBeUndefined();
  });
});

describe("isEmptyPolicy", () => {
  it("is true for null / non-object / empty object", () => {
    expect(isEmptyPolicy(null)).toBe(true);
    expect(isEmptyPolicy("x")).toBe(true);
    expect(isEmptyPolicy({})).toBe(true);
    expect(isEmptyPolicy({ modules: {} })).toBe(false);
  });
});

describe("extractPolicyEnvelope", () => {
  it("unwraps the { ok, policy } DB-row shape (snake_case)", () => {
    const env = extractPolicyEnvelope({
      ok: true,
      policy: { policy_json: { modules: {} }, policy_version: 7, policy_hash: "abc", updated_at: "2026-05-01" },
    });
    expect(env).toEqual({ raw: { modules: {} }, version: "7", hash: "abc", updatedAt: "2026-05-01" });
  });
  it("handles plain policy content already unwrapped", () => {
    const env = extractPolicyEnvelope({ modules: { compliance: true }, version: 3 });
    expect(env.raw).toEqual({ modules: { compliance: true }, version: 3 });
    expect(env.version).toBe("3");
  });
  it("returns a null envelope for junk", () => {
    expect(extractPolicyEnvelope(null)).toEqual({ raw: null, version: null, hash: null, updatedAt: null });
  });
});
