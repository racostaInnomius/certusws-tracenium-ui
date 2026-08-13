import { describe, it, expect } from "vitest";
import {
  snapshotPresentation,
  isRevertable,
  bySnapshotDevice,
  summarise,
} from "./snapshotStatus";

const snap = (over = {}) => ({
  id: 1,
  deviceId: "d1",
  outcome: "created",
  snapshotMoref: "snapshot-13889",
  cleanedAt: null,
  cleanupAfter: null,
  reason: null,
  ...over,
});

describe("isRevertable — the question that matters mid-incident", () => {
  it("is true only for a snapshot that still exists", () => {
    expect(isRevertable(snap())).toBe(true);
  });

  it("is false once retention reclaimed it", () => {
    expect(isRevertable(snap({ cleanedAt: "2026-07-08T00:00:00Z" }))).toBe(false);
  });

  it("is false without a snapshot reference, whatever the outcome says", () => {
    expect(isRevertable(snap({ snapshotMoref: null }))).toBe(false);
  });

  it("is false for every non-created outcome", () => {
    for (const outcome of ["pending", "failed", "not_correlated", "rejected", "timed_out", "cleaned"]) {
      expect(isRevertable(snap({ outcome }))).toBe(false);
    }
  });

  it("is false when there is no snapshot at all", () => {
    expect(isRevertable(null)).toBe(false);
    expect(isRevertable(undefined)).toBe(false);
  });
});

describe("snapshotPresentation — speaks about the rollback, not about vCenter", () => {
  it("says 'Rollback available', not 'created'", () => {
    // An operator scanning this column is deciding whether a failure is
    // recoverable. "created" does not answer that.
    expect(snapshotPresentation(snap()).label).toBe("Rollback available");
  });

  it("distinguishes reclaimed from never-taken", () => {
    // Both have no rollback point, but one is normal housekeeping and the other
    // means this machine was never protected.
    expect(snapshotPresentation(snap({ cleanedAt: "2026-07-08T00:00:00Z" })).label).toBe("Reclaimed");
    expect(snapshotPresentation(null).label).toBe("—");
    expect(snapshotPresentation(null).hint).toMatch(/No pre-patch snapshot/i);
  });

  it("explains a reclaimed snapshot cannot be reverted", () => {
    expect(snapshotPresentation(snap({ cleanedAt: "2026-07-08T00:00:00Z" })).hint).toMatch(
      /no longer be reverted/i
    );
  });

  it("explains a correlation miss in terms the operator can act on", () => {
    const p = snapshotPresentation(snap({ outcome: "not_correlated", snapshotMoref: null }));
    expect(p.label).toBe("No matching VM");
    expect(p.color).toBe("warning");
    expect(p.hint).toMatch(/gateway's scope/i);
  });

  it("translates a datastore refusal into plain language", () => {
    const p = snapshotPresentation(
      snap({ outcome: "rejected", reason: "datastore_low_free_ratio", snapshotMoref: null })
    );
    expect(p.hint).toMatch(/free space/i);
    expect(p.color).toBe("error");
  });

  it("passes a non-datastore refusal reason through", () => {
    const p = snapshotPresentation(snap({ outcome: "rejected", reason: "tls_pin_mismatch" }));
    expect(p.hint).toBe("tls_pin_mismatch");
  });

  it("shows work still in flight", () => {
    expect(snapshotPresentation(snap({ outcome: "pending" })).label).toBe("Snapshotting…");
  });

  it("mentions that a failed patch keeps its snapshot indefinitely", () => {
    const p = snapshotPresentation(snap({ cleanupAfter: "2026-07-09T12:00:00Z" }));
    expect(p.hint).toMatch(/indefinitely if the patch failed/i);
  });

  it("does not invent a label for an unrecognised outcome", () => {
    expect(snapshotPresentation(snap({ outcome: "something_new" })).label).toBe("something_new");
  });
});

describe("bySnapshotDevice", () => {
  it("indexes by device", () => {
    const map = bySnapshotDevice([snap({ deviceId: "a" }), snap({ deviceId: "b" })]);
    expect(map.get("a").deviceId).toBe("a");
    expect(map.get("zz")).toBeUndefined();
  });

  it("tolerates a missing list", () => {
    expect(bySnapshotDevice(undefined).size).toBe(0);
  });
});

describe("summarise — 'how many are about to be patched with no way back?'", () => {
  it("counts protected, unprotected, pending and reclaimed", () => {
    const s = summarise([
      snap({ deviceId: "a" }),
      snap({ deviceId: "b" }),
      snap({ deviceId: "c", outcome: "failed", snapshotMoref: null }),
      snap({ deviceId: "d", outcome: "pending", snapshotMoref: null }),
      snap({ deviceId: "e", cleanedAt: "2026-07-08T00:00:00Z" }),
    ]);
    expect(s).toEqual({ total: 5, protected: 2, pending: 1, unprotected: 1, reclaimed: 1 });
  });

  it("does not count a reclaimed snapshot as unprotected", () => {
    // Its patch already succeeded — that is housekeeping, not exposure.
    const s = summarise([snap({ cleanedAt: "2026-07-08T00:00:00Z" })]);
    expect(s.unprotected).toBe(0);
    expect(s.reclaimed).toBe(1);
  });

  it("counts a correlation miss as unprotected", () => {
    const s = summarise([snap({ outcome: "not_correlated", snapshotMoref: null })]);
    expect(s.unprotected).toBe(1);
  });

  it("handles an empty or missing list", () => {
    expect(summarise([])).toEqual({ total: 0, protected: 0, pending: 0, unprotected: 0, reclaimed: 0 });
    expect(summarise(undefined).total).toBe(0);
  });
});
