import { describe, it, expect } from "vitest";
import { formProblems, agentConfigSlice, composeFirstOverride, AGENT_CONFIG_KEYS } from "./formGuards";
import { formToPolicy, readFormFromPolicy } from "../Policies/policyTransforms";

const CATALOG = [
  { key: "amp", required: true },
  { key: "scp", impliesModule: "compliance" },
];

describe("formProblems", () => {
  it("accepts blanks — blank means backend default", () => {
    const form = readFormFromPolicy({}, CATALOG);
    expect(formProblems(form)).toEqual([]);
  });

  it("rejects an out-of-range interval and names the section it lives in", () => {
    const form = readFormFromPolicy({}, CATALOG);
    form.inventory.intervalSeconds = 5;
    form.cdp.intervalSeconds = 10;
    const problems = formProblems(form);
    expect(problems.map((p) => p.section)).toEqual(["amp", "cdp"]);
  });

  it("rejects a non-number", () => {
    const form = readFormFromPolicy({}, CATALOG);
    form.patch.intervalSeconds = "abc";
    expect(formProblems(form)).toHaveLength(1);
  });
});

describe("agentConfigSlice", () => {
  it("drops the domains other pages own and keeps the plugin block", () => {
    const form = readFormFromPolicy(
      { plugins: { enabled: ["amp", "scp"] }, security: { mode: "audit" }, mam: { x: 1 } },
      CATALOG
    );
    const slice = agentConfigSlice(form, CATALOG, formToPolicy);
    expect(slice.security).toBeUndefined();
    expect(slice.mam).toBeUndefined();
    expect(slice.managedApp).toBeUndefined();
    expect(slice.plugins.enabled).toEqual(["amp", "scp"]);
  });
});

describe("composeFirstOverride", () => {
  it("keeps every foreign block of the effective policy verbatim and replaces the agent-config keys", () => {
    const effective = {
      plugins: { enabled: ["amp", "scp", "pmp"] },
      inventory: { intervalSeconds: 600 },
      security: { defaultMode: "enforce", weird: [1, 2] },
      mam: { requirePin: true },
      gateway: { id: "gw-1", secret: "opaque" },
      macos: { restrictions: {} },
      somethingNew: { keep: "me" },
    };
    const slice = { plugins: { enabled: ["amp", "scp", "pmp"] }, update: { intervalSeconds: 7200 } };
    const doc = composeFirstOverride(effective, slice);
    expect(doc.security).toBe(effective.security);
    expect(doc.mam).toBe(effective.mam);
    expect(doc.gateway).toBe(effective.gateway);
    expect(doc.macos).toBe(effective.macos);
    expect(doc.somethingNew).toBe(effective.somethingNew);
    // blanked in the form → absent from the slice → REMOVED, not inherited
    expect(doc.inventory).toBeUndefined();
    expect(doc.update).toEqual({ intervalSeconds: 7200 });
    expect(effective.plugins).toEqual({ enabled: ["amp", "scp", "pmp"] }); // input untouched
  });

  it("copes with no effective policy at all", () => {
    expect(composeFirstOverride(null, { plugins: { enabled: ["amp"] } })).toEqual({ plugins: { enabled: ["amp"] } });
  });

  it("owns the same keys the server whitelists for agent-config", () => {
    // If this fails, POLICY_DOMAINS changed in the backend: update the mirror.
    expect(AGENT_CONFIG_KEYS).toEqual(["plugins", "modules", "inventory", "compliance", "patch", "update", "agent", "features", "rcp", "cdp", "ai", "sdp"]);
  });
});
