// src/components/Compliance/useFindingLifecycle.js
//
// Sprint 2 item 6 — the single-finding lifecycle mutations (ack /
// revoke / change-status + its confirm dialog + history dialog),
// extracted verbatim from DeviceDrawerContent so the drawer body drops
// back under 500 lines and this logic can be tested without mounting
// the whole drawer. Pure React state + the api/compliance helpers; the
// host still owns toast + refetch (injected), exactly as before.

import * as React from "react";
import {
  acknowledgeFinding,
  revokeFindingAcknowledgement,
  updateFindingRemediationStatus,
} from "../../api/compliance";
import { REMEDIATION_STATUS_META } from "./complianceChips";
import { shortDate } from "./complianceHelpers";

export function useFindingLifecycle({ onToast, onRequestRefetch }) {
  // pendingAction tracks which finding has a mutation in-flight so
  // FindingCard can disable its buttons + show a spinner without each
  // card holding its own state. One concurrent mutation per drawer is
  // a deliberate simplification: a flurry of clicks on different
  // findings would race against the parent refetch and make the UI
  // feel sluggish; serializing them is fine for an operator workflow.
  const [pendingAction, setPendingAction] = React.useState(null);
  // statusDialog: { finding, targetStatus } when open, null otherwise.
  const [statusDialog, setStatusDialog] = React.useState(null);
  // historyDialog: { finding } when open.
  const [historyDialog, setHistoryDialog] = React.useState(null);

  /**
   * Wraps any lifecycle API call with the standard shape:
   *   - mark pending
   *   - call the helper
   *   - branch on res.ok (parsed business-level result, NOT raw fetch)
   *   - toast + refetch on success, toast on failure
   *   - clear pending
   */
  async function runMutation(finding, apiCall, successMessage) {
    setPendingAction(finding.id);
    try {
      const res = await apiCall();
      if (res?.ok) {
        onToast?.({ severity: "success", message: successMessage });
        // The cache helper in api/http.js invalidates GETs that share
        // the mutation's URL prefix; the drawer's device detail fetch
        // DOES NOT share that prefix, so we explicitly ask the parent
        // to refetch.
        onRequestRefetch?.();
      } else {
        // Backend returned a structured failure (INVALID_TRANSITION,
        // FINDING_CLOSED, FINDING_NOT_FOUND). Surface the human
        // message rather than a generic error.
        onToast?.({
          severity: "warning",
          message: res?.message || "Action was not allowed.",
        });
      }
    } catch (err) {
      onToast?.({ severity: "error", message: err?.message || String(err) });
    } finally {
      setPendingAction(null);
    }
  }

  function handleAck(finding, acknowledgedUntil = null) {
    const untilLabel = acknowledgedUntil ? ` until ${shortDate(acknowledgedUntil)}` : "";
    return runMutation(
      finding,
      () => acknowledgeFinding(finding.id, { acknowledgedUntil }),
      `Finding acknowledged${untilLabel}.`
    );
  }
  function handleRevoke(finding) {
    return runMutation(
      finding,
      () => revokeFindingAcknowledgement(finding.id),
      "Acknowledgement revoked."
    );
  }
  function handleChangeStatus(finding, next) {
    // Open the confirmation dialog. Actual API call happens in
    // confirmStatusChange after the operator types a note (and we
    // validate that terminal transitions HAVE a note).
    setStatusDialog({ finding, targetStatus: next });
  }
  async function confirmStatusChange({ note }) {
    if (!statusDialog) return;
    const { finding, targetStatus } = statusDialog;
    setStatusDialog(null);
    await runMutation(
      finding,
      () => updateFindingRemediationStatus(finding.id, { status: targetStatus, note }),
      `Status set to ${REMEDIATION_STATUS_META[targetStatus]?.label}.`
    );
  }

  return {
    pendingAction,
    statusDialog,
    setStatusDialog,
    historyDialog,
    setHistoryDialog,
    handleAck,
    handleRevoke,
    handleChangeStatus,
    confirmStatusChange,
  };
}
