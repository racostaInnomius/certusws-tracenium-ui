// src/components/patch-management/patchCatalog.test.js
import { describe, expect, it } from "vitest";
import { approvalMeta, confidenceText, decisionPayload, matchesFilter, pendingSinceText, targetsText } from "./patchCatalog";

const now = Date.parse("2026-10-06T12:00:00Z");

describe("patch catalog copy", () => {
  it("⭐ a date from before the catalog reads as a floor", () => {
    expect(pendingSinceText({ oldestPendingSince: "2026-09-29T10:00:00Z", oldestPendingBackfilled: true }, now)).toBe("≥ 7 days");
    expect(pendingSinceText({ oldestPendingSince: "2026-10-05T10:00:00Z", oldestPendingBackfilled: false }, now)).toBe("1 day");
    expect(pendingSinceText({ oldestPendingSince: null }, now)).toBe("—");
  });

  it("targets in MSRC names; unset ones are left out", () => {
    expect(targetsText({ critical: 7, high: 30, medium: null, low: null })).toBe("Critical 7 d · Important 30 d");
    expect(targetsText({ critical: null, high: null, medium: null, low: null })).toBe("");
  });

  it("confidence: a score with its evidence, or why there is none", () => {
    expect(confidenceText({ score: 0.923, devices: 3, attempts: 4, failedAttempts: 1, uninstalls: 0, evidence: "thin" })).toMatchObject({ label: "92%" });
    expect(confidenceText(null).label).toBe("—");
    expect(approvalMeta(null).label).toBe("Not reviewed");
  });

  it("filters by text and decision", () => {
    const it1 = { patchId: "KB5122882", title: "Cumulative", approval: "blocked" };
    expect(matchesFilter(it1, { text: "5122", approval: "all" })).toBe(true);
    expect(matchesFilter(it1, { approval: "unreviewed" })).toBe(false);
    expect(matchesFilter({ ...it1, approval: null }, { approval: "unreviewed" })).toBe(true);
  });
});

describe("decisionPayload", () => {
  const base = { approval: "none", reason: "", deferredUntil: "", knownIssue: "", supersededBy: "" };
  const at = new Date("2026-10-06T12:00:00Z");
  it("⭐ blocking needs a reason; deferring needs a future date", () => {
    expect(decisionPayload({ ...base, approval: "blocked" }, at).error).toMatch(/Say why/);
    expect(decisionPayload({ ...base, approval: "blocked", reason: "RDS hang" }, at).body).toEqual({ approval: "blocked", reason: "RDS hang", knownIssue: null, supersededBy: null });
    expect(decisionPayload({ ...base, approval: "deferred", deferredUntil: "2026-10-01" }, at).error).toMatch(/future/);
    expect(decisionPayload({ ...base, approval: "deferred", deferredUntil: "2026-10-20" }, at).body.deferredUntil).toBe("2026-10-20T00:00:00.000Z");
  });
  it("clearing the decision sends null; a bad superseded id is refused", () => {
    expect(decisionPayload(base, at).body).toEqual({ approval: null, knownIssue: null, supersededBy: null });
    expect(decisionPayload({ ...base, supersededBy: "KB1; drop" }, at).error).toMatch(/patch id/);
  });
});
