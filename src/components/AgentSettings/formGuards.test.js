import { describe, it, expect } from "vitest";
import {
  formProblems,
  agentConfigSlice,
  domainSlice,
  deviceDomainSlice,
  domainsTouched,
  overriddenDomains,
  DOMAIN_PATHS,
} from "./formGuards";
import { formToPolicy, readFormFromPolicy } from "../Policies/policyTransforms";
import { diffPolicies } from "./policyDiff";

const CATALOG = [
  { key: "amp", required: true },
  { key: "scp", impliesModule: "compliance" },
  { key: "rcp", impliesModule: "remoteControl" },
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
  it("drops the domains other pages own AND the plan-derived plugin block", () => {
    const form = readFormFromPolicy(
      { plugins: { enabled: ["amp", "scp"] }, security: { mode: "audit" }, mam: { x: 1 }, update: { intervalSeconds: 600 } },
      CATALOG
    );
    const slice = agentConfigSlice(form, CATALOG, formToPolicy);
    expect(slice.security).toBeUndefined();
    expect(slice.mam).toBeUndefined();
    expect(slice.managedApp).toBeUndefined();
    expect(slice.plugins).toBeUndefined();
    expect(slice.modules).toBeUndefined();
    expect(slice.update).toEqual({ intervalSeconds: 600 });
  });
});

describe("domainSlice", () => {
  const full = {
    update: { intervalSeconds: 7200 },
    features: { selfUpdate: true, remoteShell: true, locationTracking: false },
    cdp: { intervalSeconds: 900 },
    rcp: { file: { roots: ["/home"] } },
  };

  it("cuts exactly the domain's paths, splitting the shared features block", () => {
    expect(domainSlice("agent", full)).toEqual({
      update: { intervalSeconds: 7200 },
      features: { selfUpdate: true, locationTracking: false },
    });
    expect(domainSlice("rcp", full)).toEqual({ rcp: { file: { roots: ["/home"] } }, features: { remoteShell: true } });
    expect(domainSlice("cdp", full)).toEqual({ cdp: { intervalSeconds: 900 } });
  });

  it("omits paths the document does not carry (omit-empty)", () => {
    expect(domainSlice("amp", full)).toEqual({});
    expect(domainSlice("ai", { ai: { enabled: false } })).toEqual({ ai: { enabled: false } });
  });

  it("mirrors the backend's domain map for every section this page saves", () => {
    // If this changes, the backend's POLICY_DOMAINS must change with it.
    expect(Object.keys(DOMAIN_PATHS)).toEqual(["agent", "amp", "scp", "pmp", "sdp", "cdp", "rcp", "ai"]);
    expect(DOMAIN_PATHS.rcp).toContain("features.remoteRequireConsent");
    expect(DOMAIN_PATHS.agent).toContain("features.selfUpdate");
  });
});

describe("deviceDomainSlice", () => {
  const tenant = { update: { intervalSeconds: 21600 }, features: { selfUpdate: true, remoteShell: true }, cdp: { intervalSeconds: 3600 } };

  it("carries only what differs from the tenant", () => {
    const device = { update: { intervalSeconds: 7200 }, features: { selfUpdate: true, remoteShell: true }, cdp: { intervalSeconds: 3600 } };
    expect(deviceDomainSlice("agent", device, tenant)).toEqual({ update: { intervalSeconds: 7200 } });
    expect(deviceDomainSlice("cdp", device, tenant)).toEqual({});
  });

  it("a value edited back to the tenant's drops out of the override", () => {
    const device = { ...tenant, features: { selfUpdate: false, remoteShell: true } };
    expect(deviceDomainSlice("agent", device, tenant)).toEqual({ features: { selfUpdate: false } });
    expect(deviceDomainSlice("agent", tenant, tenant)).toEqual({});
  });

  it("compares by value, not by reference, and inherits when the device has no value", () => {
    const device = { update: { intervalSeconds: 21600 } };
    expect(deviceDomainSlice("agent", device, tenant)).toEqual({});
  });
});

describe("domainsTouched / overriddenDomains", () => {
  it("maps changed paths to the sections that own them, in domain order", () => {
    const diff = diffPolicies(
      { update: { intervalSeconds: 1 }, features: { remoteShell: false }, cdp: { intervalSeconds: 1 } },
      { update: { intervalSeconds: 2 }, features: { remoteShell: true }, cdp: { intervalSeconds: 2 } }
    );
    expect(domainsTouched(diff)).toEqual(["agent", "cdp", "rcp"]);
  });

  it("ignores paths no agent domain owns", () => {
    expect(domainsTouched([{ path: "security.mode" }, { path: "plugins.enabled" }])).toEqual([]);
    expect([...overriddenDomains(["cdp", "features.remoteShell", "gateway"])]).toEqual(["cdp", "rcp"]);
  });
});
