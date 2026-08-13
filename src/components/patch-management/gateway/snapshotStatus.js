// src/components/patch-management/gateway/snapshotStatus.js
//
// Presentation for a device's pre-patch snapshot, shown alongside its install
// result. PURE — no React, no network.
//
// The question this answers, mid-patch-window, is "which of these machines can
// I roll back?". So the vocabulary is about the ROLLBACK POINT, not about the
// mechanics of vCenter: an operator scanning this column is deciding whether a
// failure is recoverable, and "created" or "cleaned" tell them nothing.

/** Can this device still be rolled back right now? */
export function isRevertable(snapshot) {
  return Boolean(snapshot && snapshot.outcome === "created" && !snapshot.cleanedAt && snapshot.snapshotMoref);
}

export function snapshotPresentation(snapshot) {
  if (!snapshot) {
    // No row at all: this device was never in the snapshot plan — a physical
    // host, or a VM with no gateway. Not a problem, just not applicable.
    return { label: "—", color: "default", hint: "No pre-patch snapshot was taken for this device" };
  }

  if (snapshot.cleanedAt) {
    return {
      label: "Reclaimed",
      color: "default",
      hint: "The patch succeeded and the snapshot was reclaimed by retention. It can no longer be reverted.",
    };
  }

  switch (snapshot.outcome) {
    case "created":
      return {
        label: "Rollback available",
        color: "success",
        hint: snapshot.cleanupAfter
          ? `Kept until ${new Date(snapshot.cleanupAfter).toLocaleString()} — or indefinitely if the patch failed`
          : "Rollback point available",
      };
    case "pending":
      return { label: "Snapshotting…", color: "info", hint: "Waiting for the gateway" };
    case "not_correlated":
      return {
        label: "No matching VM",
        color: "warning",
        hint:
          snapshot.reason ||
          "vCenter has no VM matching this endpoint, so no snapshot was taken. Check that it is a VM in the gateway's scope.",
      };
    case "rejected":
      return {
        label: "Refused",
        color: "error",
        hint: snapshot.reason?.startsWith("datastore_")
          ? "Refused: the datastore did not have enough free space to hold a snapshot safely."
          : snapshot.reason || "The gateway refused to take a snapshot",
      };
    case "timed_out":
      return { label: "Timed out", color: "error", hint: "vCenter did not finish the snapshot in time" };
    case "failed":
      return { label: "Failed", color: "error", hint: snapshot.reason || "The snapshot failed" };
    case "cleaned":
      return { label: "Reclaimed", color: "default", hint: "Reclaimed by retention" };
    default:
      return { label: snapshot.outcome, color: "default", hint: snapshot.reason || "" };
  }
}

/**
 * Index snapshots by device so a results grid can join them without an O(n²)
 * scan per render.
 */
export function bySnapshotDevice(snapshots) {
  const map = new Map();
  for (const s of snapshots ?? []) map.set(s.deviceId, s);
  return map;
}

/**
 * Fleet-level summary for the drawer header.
 *
 * `unprotected` is the number an operator actually cares about before hitting
 * a patch run: how many machines are about to be patched with no way back.
 */
export function summarise(snapshots) {
  const list = snapshots ?? [];
  const protectedCount = list.filter((s) => isRevertable(s)).length;
  const pending = list.filter((s) => s.outcome === "pending").length;
  const unprotected = list.filter(
    (s) => s.outcome !== "pending" && !isRevertable(s) && !s.cleanedAt
  ).length;
  const reclaimed = list.filter((s) => Boolean(s.cleanedAt)).length;
  return { total: list.length, protected: protectedCount, pending, unprotected, reclaimed };
}
