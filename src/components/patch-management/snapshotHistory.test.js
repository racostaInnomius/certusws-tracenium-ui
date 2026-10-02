// src/components/patch-management/snapshotHistory.test.js
import { describe, expect, it } from "vitest";
import { filterCount, historyStatus, lifetimeText, protectsText, verificationSummary } from "./snapshotHistory";

const H = 3_600_000;

describe("historyStatus", () => {
  it("⭐ a live one reads exactly as in the decision list (its RollbackPoint state)", () => {
    expect(historyStatus({ stage: "live", live: { state: "needs_decision" } })).toMatchObject({ label: "Needs your decision", tone: "critical" });
  });

  it("removed: who released it and why, or that retention did", () => {
    const op = historyStatus({ stage: "removed", removedBy: "operator", releasedBy: "2", releasedByEmail: "ops@x.com", releaseReason: "validated" });
    expect(op).toMatchObject({ label: "Released" });
    expect(op.detail).toBe("Released by ops@x.com — Validated");
    expect(historyStatus({ stage: "removed", removedBy: "retention" }).label).toBe("Removed automatically");
  });

  it("not taken says why in words; merged points at the snapshot it shares", () => {
    expect(historyStatus({ stage: "failed", failureReason: "not_correlated" }).detail).toMatch(/VM was not found/);
    expect(historyStatus({ stage: "failed", failureReason: "some_new_reason" }).detail).toBe("some new reason");
    expect(historyStatus({ stage: "merged", mergedIntoId: 8 }).detail).toMatch(/#8/);
  });
});

describe("verificationSummary", () => {
  it("one failed run is enough to say not healthy", () => {
    expect(verificationSummary([{ verification: "passed" }, { verification: "failed" }])).toMatchObject({ tone: "critical" });
    expect(verificationSummary([{ verification: "passed" }]).label).toBe("Checked healthy");
    expect(verificationSummary([{ verification: null }])).toBeNull();
  });
});

describe("counts, protects, lifetime", () => {
  it("All sums the stages (reverted overlaps them); Live includes requested", () => {
    const c = { requested: 1, live: 2, removed: 10, failed: 1, merged: 1, reverted: 3 };
    expect(filterCount(c, "all")).toBe(15);
    expect(filterCount(c, "live")).toBe(3);
    expect(filterCount(null, "all")).toBeNull();
  });

  it("names what it protected", () => {
    expect(protectsText({ purpose: "prepatch", deploymentId: 12, jobs: [] })).toBe("Software deployment #12");
    expect(protectsText({ purpose: "patch", jobs: [{}, {}] })).toBe("2 patch runs");
  });

  it("lifetime: taken → removed, or so far", () => {
    const t0 = Date.parse("2026-09-20T00:00:00Z");
    expect(lifetimeText({ stage: "removed", requestedAt: new Date(t0).toISOString(), removedAt: new Date(t0 + 30 * H).toISOString() })).toBe("30 h");
    expect(lifetimeText({ stage: "live", requestedAt: new Date(t0).toISOString() }, t0 + 5 * H)).toBe("5 h so far");
    expect(lifetimeText({ stage: "failed", requestedAt: new Date(t0).toISOString() })).toBe("—");
  });
});
