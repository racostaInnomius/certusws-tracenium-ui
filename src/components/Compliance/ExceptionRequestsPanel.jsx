// src/components/Compliance/ExceptionRequestsPanel.jsx
//
// P1-7 — the exceptions register: pending requests to decide, and the
// history of what was approved, rejected, expired or revoked. An owner or
// admin approves or rejects someone else's request; the requester can
// withdraw their own while it is pending. The backend enforces all of it
// (403 SELF_APPROVAL_FORBIDDEN / APPROVER_ROLE_REQUIRED); the buttons only
// avoid offering what would be refused.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import AsyncState from "../common/AsyncState";
import {
  approveExceptionRequest,
  cancelExceptionRequest,
  listExceptionRequests,
  rejectExceptionRequest,
} from "../../api/compliance";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { SeverityChip } from "./complianceChips";
import { EXCEPTION_KIND_META, shortDate } from "./complianceHelpers";

const STATUS_META = {
  pending: { label: "Pending approval", bg: ROLE.cautionSoft, color: BRAND.alert.warningText },
  approved: { label: "Approved", bg: BRAND.tealSoft, color: BRAND.tealText },
  rejected: { label: "Rejected", bg: ROLE.criticalSoft, color: BRAND.alert.errorText },
  cancelled: { label: "Cancelled", bg: BRAND.surfaceMuted, color: BRAND.gray },
  expired: { label: "Expired", bg: BRAND.surfaceMuted, color: BRAND.gray },
  revoked: { label: "Revoked", bg: BRAND.surfaceMuted, color: BRAND.gray },
  superseded: { label: "Renewed", bg: BRAND.surfaceMuted, color: BRAND.gray },
};

export default function ExceptionRequestsPanel({ reloadKey = 0, onToast }) {
  const [view, setView] = React.useState("pending");
  const [items, setItems] = React.useState([]);
  const [canDecide, setCanDecide] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  // decision: { request, action: "approve" | "reject" | "cancel" } when open.
  const [decision, setDecision] = React.useState(null);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listExceptionRequests({ status: view === "pending" ? "pending" : undefined })
      .then((res) => {
        if (cancelled) return;
        setItems(Array.isArray(res?.items) ? res.items : []);
        setCanDecide(Boolean(res?.viewer?.canDecide));
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, reloadKey, tick]);

  function openDecision(request, action) {
    setNote("");
    setDecision({ request, action });
  }

  async function confirmDecision() {
    if (!decision) return;
    const { request, action } = decision;
    const call = action === "approve" ? approveExceptionRequest : action === "reject" ? rejectExceptionRequest : cancelExceptionRequest;
    setDecision(null);
    setBusyId(request.id);
    try {
      const res = await call(request.id, { note: note.trim() || null });
      if (res?.ok) {
        const verb = action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled";
        onToast?.({ severity: "success", message: `Exception request #${request.id} ${verb}.` });
        setTick((t) => t + 1);
      } else {
        onToast?.({ severity: "warning", message: res?.message || "The request could not be decided." });
      }
    } catch (err) {
      onToast?.({ severity: "error", message: err?.body?.message || err?.message || String(err) });
    } finally {
      setBusyId(null);
    }
  }

  const noteRequired = decision?.action === "reject";

  return (
    <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: TEXT.md }}>Exception requests</Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            Acknowledgements, accepted risks and won't-fix decisions. Each one needs a justification, a risk owner and an
            expiry of at most 12 months, and is approved by an owner or administrator other than the requester.
          </Typography>
        </Box>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, v) => v && setView(v)}>
          <ToggleButton value="pending" sx={{ textTransform: "none" }}>Pending</ToggleButton>
          <ToggleButton value="all" sx={{ textTransform: "none" }}>All</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <AsyncState
        loading={loading}
        error={error}
        onRetry={() => setTick((t) => t + 1)}
        isEmpty={items.length === 0}
        emptyText={view === "pending" ? "No exception requests waiting for a decision." : "No exception requests yet."}
      >
        <Stack spacing={1}>
          {items.map((r) => {
            const status = STATUS_META[r.status] ?? STATUS_META.cancelled;
            const pending = r.status === "pending";
            const busy = busyId === r.id;
            return (
              <Box key={r.id} data-testid={`exception-request-${r.id}`} sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", gap: 0.5, mb: 0.5 }}>
                  <Chip size="small" label={status.label} sx={{ bgcolor: status.bg, color: status.color, fontWeight: 700 }} />
                  <Chip size="small" label={EXCEPTION_KIND_META[r.kind]?.label ?? r.kind} variant="outlined" />
                  {r.severity ? <SeverityChip severity={r.severity} /> : null}
                  <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700 }}>{r.title || r.checkId}</Typography>
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>on {r.hostname || r.agentId}</Typography>
                </Stack>
                <Typography sx={{ fontSize: TEXT.sm, whiteSpace: "pre-wrap", mb: 0.5 }}>{r.justification}</Typography>
                <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                  Requested by {r.requestedBy} on {shortDate(r.requestedAt)} · risk owner {r.riskOwner} · expires {shortDate(r.expiresAt)}
                  {r.decidedBy ? ` · ${r.status === "rejected" ? "rejected" : "approved"} by ${r.decidedBy} on ${shortDate(r.decidedAt)}` : ""}
                  {r.decisionNote ? ` — “${r.decisionNote}”` : ""}
                  {r.closedReason && !pending && r.status !== "approved" ? ` · ${r.closedReason}` : ""}
                </Typography>
                {pending ? (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    {canDecide && !r.mine ? (
                      <>
                        <Button size="small" variant="contained" disabled={busy} onClick={() => openDecision(r, "approve")} sx={{ textTransform: "none" }}>
                          Approve
                        </Button>
                        <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => openDecision(r, "reject")} sx={{ textTransform: "none" }}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {r.mine || canDecide ? (
                      <Button size="small" disabled={busy} onClick={() => openDecision(r, "cancel")} sx={{ textTransform: "none" }}>
                        {r.mine ? "Withdraw" : "Cancel"}
                      </Button>
                    ) : null}
                    {r.mine && canDecide ? (
                      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, alignSelf: "center" }}>
                        Your own request: another owner or admin has to decide it.
                      </Typography>
                    ) : null}
                  </Stack>
                ) : null}
              </Box>
            );
          })}
        </Stack>
      </AsyncState>

      <Dialog open={Boolean(decision)} onClose={() => setDecision(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {decision?.action === "approve" ? "Approve exception" : decision?.action === "reject" ? "Reject exception" : "Cancel request"}
        </DialogTitle>
        <DialogContent>
          {decision?.action === "approve" ? (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 2 }}>
              The exception applies to the finding until {shortDate(decision.request.expiresAt)}. Your approval is recorded in the finding
              history, the audit log and the evidence pack.
            </Typography>
          ) : null}
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label={noteRequired ? "Reason" : "Note (optional)"}
            required={noteRequired}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecision(null)}>Back</Button>
          <Button variant="contained" disabled={noteRequired && !note.trim()} onClick={confirmDecision}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </SectionPaper>
  );
}
