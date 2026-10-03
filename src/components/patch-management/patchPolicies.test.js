// src/components/patch-management/patchPolicies.test.js
import { describe, expect, it } from "vitest";
import { cadenceText, emptyPolicyForm, policyPayload, policyToForm, ringText, runSummary } from "./patchPolicies";

describe("patch policy copy", () => {
  it("cadence in words", () => {
    expect(cadenceText({ kind: "patch_tuesday", offsetDays: 2, atMinute: 1320, timezone: "America/Chicago" })).toBe("Patch Tuesday + 2 days, 22:00 America/Chicago");
    expect(cadenceText({ kind: "weekly", weekday: 6, atMinute: 120, timezone: "UTC" })).toBe("Every Saturday, 02:00 UTC");
    expect(cadenceText({ kind: "monthly", dayOfMonth: 22, atMinute: 0, timezone: "UTC" })).toBe("Monthly on the 22nd, 00:00 UTC");
  });

  it("⭐ a halted run says where and why; a running one, which ring", () => {
    const rings = [{ name: "Pilot" }, { name: "Broad" }];
    expect(runSummary({ status: "halted", currentRing: 0, rings, haltedReason: "Pilot: only 50% checked healthy" })).toMatchObject({ label: "Halted at Pilot", tone: "critical", detail: /50%/ });
    expect(runSummary({ status: "running", currentRing: 1, rings: [{ name: "Pilot" }, { name: "Broad", reason: "soaking" }] })).toMatchObject({ label: "Broad (2 of 2)", detail: "soaking" });
    expect(runSummary({ status: "completed", patchIds: [], haltedReason: "nothing to install in scope", rings })).toMatchObject({ label: "Nothing to install" });
    expect(runSummary(null).label).toBe("Not run yet");
    expect(ringText({ dispatchedAt: "x", devices: 3, jobsCreated: 3, stats: { green: 2, failed: 1 } })).toBe("3 device(s) · 3 job(s) · 2 checked healthy · 1 failed");
  });
});

describe("policyPayload", () => {
  it("⭐ form → body: local time in minutes, only the cadence's field, last ring may be everyone else", () => {
    const f = { ...emptyPolicyForm(), name: "Servers", scopeAssetGroupId: "4", cadence: { kind: "patch_tuesday", offsetDays: "2", weekday: 6, dayOfMonth: 1, atTime: "22:00", timezone: "America/Chicago" }, rings: [{ name: "Pilot", assetGroupId: "11", soakHours: "24" }, { name: "Rest", assetGroupId: "", soakHours: "0" }] };
    const { body } = policyPayload(f);
    expect(body).toMatchObject({ name: "Servers", scopeAssetGroupId: 4, platforms: null, cadence: { kind: "patch_tuesday", offsetDays: 2, atMinute: 1320, timezone: "America/Chicago" }, deadlineDays: null, windowMode: "window" });
    expect(body.cadence).not.toHaveProperty("weekday");
    expect(body.rings).toEqual([{ name: "Pilot", assetGroupId: 11, soakHours: 24 }, { name: "Rest", assetGroupId: null, soakHours: 0 }]);
  });

  it("refuses an early ring without a group and a bad deadline", () => {
    const f = { ...emptyPolicyForm(), name: "x" };
    expect(policyPayload(f).error).toMatch(/Ring 1 needs a group/);
    f.rings = [{ name: "All", assetGroupId: "", soakHours: 0 }];
    expect(policyPayload({ ...f, deadlineDays: "120" }).error).toMatch(/1 to 90/);
    expect(policyPayload({ ...f, deadlineDays: "7", deadlineIgnoresWindow: true }).body).toMatchObject({ deadlineDays: 7, deadlineIgnoresWindow: true });
  });

  it("round-trips a saved policy", () => {
    const saved = { name: "P", enabled: true, scopeAssetGroupId: null, platforms: ["windows"], severities: ["critical"], requireApproval: true, cadence: { kind: "weekly", weekday: 6, atMinute: 90, timezone: "UTC" }, rebootIfRequired: true, windowMode: "on_connect", deadlineDays: 5, deadlineIgnoresWindow: false, promoteThresholdPct: 90, promoteMinDevices: 2, rings: [{ name: "All", assetGroupId: null, soakHours: 0 }] };
    expect(policyPayload(policyToForm(saved)).body).toEqual(saved);
  });
});
