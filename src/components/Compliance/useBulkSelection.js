// src/components/Compliance/useBulkSelection.js
//
// Sprint 2 item 6 — bulk selection (Set<findingId>) + the bulk lifecycle
// runners (ack / revoke / change-status with its confirm dialog),
// extracted verbatim from DeviceDrawerContent. Host injects toast +
// refetch; `findings` feeds selectAll; `resetKey` (the agentId) clears
// the selection when the drawer switches device without closing.

import * as React from "react";
import { bulkFindingOp } from "../../api/compliance";
import { REMEDIATION_STATUS_META } from "./complianceChips";
import { shortDate } from "./complianceHelpers";

export function useBulkSelection({ findings, resetKey, onToast, onRequestRefetch }) {
  // Set (not array) so toggle is O(1); the bulk toolbar reads size to
  // decide whether to show.
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  // bulkStatusDialog: { targetStatus } when open.
  const [bulkStatusDialog, setBulkStatusDialog] = React.useState(null);
  // Anchor for the bulk action menu.
  const [bulkMenuAnchor, setBulkMenuAnchor] = React.useState(null);
  const [bulkPending, setBulkPending] = React.useState(false);

  React.useEffect(() => {
    // Different device => clear selection so an "Acknowledge all 5
    // selected" doesn't accidentally target the previous device's
    // findings after navigation.
    setSelectedIds(new Set());
  }, [resetKey]);

  const toggleSelected = React.useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = React.useCallback(() => {
    setSelectedIds(new Set(findings.map((f) => f.id).filter(Boolean)));
  }, [findings]);
  const clearSelection = React.useCallback(() => setSelectedIds(new Set()), []);

  // Each bulk handler: (1) finding-id array from the selection, (2)
  // bulkFindingOp + unpack the per-item summary, (3) toast "X ok, Y
  // failed" so partial success is visible at a glance, (4) refetch +
  // clear selection on success.
  function summarizeBulk(label, summary) {
    const ok = summary?.ok ?? 0;
    const failed = summary?.failed ?? 0;
    const total = summary?.total ?? ok + failed;
    if (failed === 0) {
      return { severity: "success", message: `${label}: ${ok}/${total} ok` };
    }
    return {
      severity: "warning",
      message: `${label}: ${ok}/${total} ok, ${failed} failed (check audit log)`,
    };
  }

  async function runBulk(opPayload, label) {
    const findingIds = Array.from(selectedIds);
    if (findingIds.length === 0) return;
    setBulkPending(true);
    try {
      const res = await bulkFindingOp({ ...opPayload, findingIds });
      if (res?.ok) {
        onToast?.(summarizeBulk(label, res.summary));
        clearSelection();
        onRequestRefetch?.();
      } else {
        onToast?.({ severity: "error", message: res?.message || "Bulk action failed." });
      }
    } catch (err) {
      onToast?.({ severity: "error", message: err?.message || String(err) });
    } finally {
      setBulkPending(false);
    }
  }

  function handleBulkAck(acknowledgedUntil = null) {
    setBulkMenuAnchor(null);
    const untilLabel = acknowledgedUntil ? ` until ${shortDate(acknowledgedUntil)}` : "";
    return runBulk({ op: "acknowledge", acknowledgedUntil }, `Acknowledged${untilLabel}`);
  }
  function handleBulkRevoke() {
    setBulkMenuAnchor(null);
    return runBulk({ op: "revoke_acknowledgement" }, "Acknowledgement revoked");
  }
  function handleBulkChangeStatus(next) {
    setBulkMenuAnchor(null);
    // Same confirmation pattern as the single-finding flow: terminal
    // states require a note. The bulk dialog reuses StatusChangeDialog.
    setBulkStatusDialog({ targetStatus: next });
  }
  async function confirmBulkStatusChange({ note }) {
    if (!bulkStatusDialog) return;
    const { targetStatus } = bulkStatusDialog;
    setBulkStatusDialog(null);
    await runBulk(
      { op: "change_status", newStatus: targetStatus, note },
      `Status set to ${REMEDIATION_STATUS_META[targetStatus]?.label}`
    );
  }

  return {
    selectedIds,
    toggleSelected,
    selectAll,
    clearSelection,
    bulkStatusDialog,
    setBulkStatusDialog,
    bulkMenuAnchor,
    setBulkMenuAnchor,
    bulkPending,
    handleBulkAck,
    handleBulkRevoke,
    handleBulkChangeStatus,
    confirmBulkStatusChange,
  };
}
