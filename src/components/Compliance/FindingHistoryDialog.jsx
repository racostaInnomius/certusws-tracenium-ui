// src/components/Compliance/FindingHistoryDialog.jsx
//
// Audit-trail dialog for a single compliance finding. Extracted from the
// SecurityCompliance god-component. Owns a one-shot fetch of the finding's
// history on open (cancelled cleanly if it closes mid-flight) — a modal that
// loads fresh each open doesn't benefit from the useCachedFetch cache, so the
// manual loading/error triple is intentional here.

import * as React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { getFindingHistory } from "../../api/compliance";
import AsyncState from "../common/AsyncState";

// Map machine event_type → human label. Kept here (not in the remediation-status
// meta) because event_type is a different enum space than remediation_status.
function humanizeEventType(t) {
  switch (t) {
    case "opened":
      return "Opened";
    case "closed":
      return "Closed";
    case "reopened":
      return "Reopened";
    case "acknowledged":
      return "Acknowledged";
    case "acknowledgement_revoked":
      return "Acknowledgement revoked";
    case "remediation_status_changed":
      return "Remediation status changed";
    case "evidence_refreshed":
      return "Evidence refreshed";
    default:
      return t;
  }
}

export default function FindingHistoryDialog({ open, finding, onClose }) {
  const [events, setEvents] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open || !finding?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvents(null);
    getFindingHistory(finding.id, { limit: 200 })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) {
          setEvents(Array.isArray(res.events) ? res.events : []);
        } else {
          setError(res?.message || "Failed to load history.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, finding?.id]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      // Stack ABOVE the device drawer (drawer's MUI z-index is 1200).
      sx={{ "& .MuiDialog-paper": { borderRadius: 2 } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: BRAND.dark }}>
          Finding history
        </Typography>
        {finding ? (
          <Typography variant="caption" sx={{ color: BRAND.gray, fontFamily: "monospace" }}>
            {finding.checkId}
          </Typography>
        ) : null}
      </DialogTitle>
      <DialogContent sx={{ minHeight: 200 }}>
        <AsyncState
          loading={loading}
          error={error}
          isEmpty={!events || events.length === 0}
          emptyText="No events recorded yet."
          minHeight={180}
        >
          {/* NOTE: JSX children are evaluated eagerly — this runs even while
              AsyncState is showing the loading/empty branch and `events` is
              still null, so the list access has to stay null-safe. */}
          <Stack spacing={1.25} sx={{ pt: 1 }}>
            {(events ?? []).map((evt) => (
              <Box
                key={evt.id}
                sx={{
                  p: 1.25,
                  borderRadius: 1,
                  border: `1px solid ${BRAND.border}`,
                  bgcolor: BRAND.surfaceMuted,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
                    {humanizeEventType(evt.eventType)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    · {new Date(evt.atUtc).toLocaleString()}
                  </Typography>
                </Stack>
                {evt.actorUserId ? (
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    by {evt.actorUserId}
                  </Typography>
                ) : (
                  <Typography variant="caption" sx={{ color: BRAND.gray, fontStyle: "italic" }}>
                    system
                  </Typography>
                )}
                {evt.previousValue || evt.newValue ? (
                  <Box
                    sx={{
                      mt: 0.5,
                      fontSize: TEXT.xs,
                      fontFamily: "monospace",
                      color: BRAND.dark,
                    }}
                  >
                    {evt.previousValue ? `from: ${JSON.stringify(evt.previousValue)}` : null}
                    {evt.previousValue && evt.newValue ? <br /> : null}
                    {evt.newValue ? `to: ${JSON.stringify(evt.newValue)}` : null}
                  </Box>
                ) : null}
                {evt.note ? (
                  <Typography variant="caption" sx={{ color: BRAND.dark, mt: 0.5, display: "block" }}>
                    “{evt.note}”
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        </AsyncState>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
