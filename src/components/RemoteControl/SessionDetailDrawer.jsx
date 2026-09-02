// src/components/RemoteControl/SessionDetailDrawer.jsx
//
// Everything about ONE session, in one place.
//
// ── What it replaces ─────────────────────────────────────────────────
//
// The material that answers "was this access legitimate?" was spread across
// three tables on this page and joined by eye: the session in the history
// table, its reason and ticket in the Access tab, and the files that moved
// during it in the File transfers tab — the last two with no way to filter
// down to one session. An auditor had to hold a session id in their head and
// scan three lists for it.
//
// ── Why the access record leads ──────────────────────────────────────
//
// Because it is the part that can be missing, and its absence means
// something. A session with no record predates ADR-0009 phase 1; a session
// with one names the person and the ticket. Burying that under the technical
// fields would make the only line an auditor actually needs the hardest one
// to find.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { getSessionDetail, getSessionFileTransfers } from "../../api/remoteControl";
import { RCP_METHODS } from "./rcpMethods";

const STATUS_META = {
  active: { label: "Active", fg: ROLE.positive, bg: ROLE.positiveSoft },
  completed: { label: "Completed", fg: BRAND.tealText, bg: BRAND.tealSoft },
  failed: { label: "Failed", fg: ROLE.critical, bg: ROLE.criticalSoft },
  cancelled: { label: "Cancelled", fg: BRAND.gray, bg: BRAND.surfaceMuted }
};

function StatusChip({ status }) {
  const meta = STATUS_META[status] || STATUS_META.cancelled;
  return (
    <Chip
      size="small"
      label={meta.label}
      sx={{
        height: 20,
        fontWeight: 700,
        fontSize: TEXT.xs,
        bgcolor: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.fg}33`
      }}
    />
  );
}

function Field({ label, children }) {
  return (
    <Box sx={{ minWidth: 150 }}>
      <Typography
        variant="caption"
        sx={{
          color: BRAND.gray,
          display: "block",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 700
        }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: BRAND.dark }}>
        {children ?? "—"}
      </Typography>
    </Box>
  );
}

function formatDuration(sec) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * @param {object|null} session  the row clicked in the history table. Used to
 *   render the header immediately — the drawer opens with the identity of the
 *   session already on screen while the detail request is in flight.
 */
export default function SessionDetailDrawer({ session, onClose, onReplay }) {
  const [detail, setDetail] = React.useState(null);
  const [transfers, setTransfers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const sessionId = session?.sessionId || "";

  React.useEffect(() => {
    if (!sessionId) return undefined;

    let alive = true;
    setLoading(true);
    setError("");
    setDetail(null);
    setTransfers([]);

    // Two requests, settled independently: a session whose transfers fail to
    // load should still show its access record. Promise.all would lose both
    // to whichever failed.
    Promise.allSettled([
      getSessionDetail(sessionId),
      getSessionFileTransfers(sessionId, { limit: 200 })
    ]).then(([detailRes, transferRes]) => {
      if (!alive) return;
      if (detailRes.status === "fulfilled" && detailRes.value?.session) {
        setDetail(detailRes.value.session);
      } else {
        setError(
          String(detailRes.reason?.message || "").includes("404")
            ? "This session no longer exists."
            : "Could not load the session detail."
        );
      }
      if (transferRes.status === "fulfilled") {
        setTransfers(
          Array.isArray(transferRes.value?.items) ? transferRes.value.items : []
        );
      }
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [sessionId]);

  const shown = detail || session;
  const method = RCP_METHODS.find((m) => m.type === shown?.type);
  const record = detail?.accessRecord ?? null;

  // Same rule the history table applies: only offer playback where something
  // was actually recorded. A shell session has a transcript; a screen session
  // has one only once the upload landed.
  const canReplay =
    shown &&
    shown.status !== "active" &&
    (shown.type === "shell" || (shown.type === "screen" && shown.hasRecording));

  return (
    <Drawer
      anchor="right"
      open={Boolean(session)}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", md: 640 }, maxWidth: "100%" } }}
    >
      {shown ? (
        <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          <Stack direction="row" alignItems="flex-start" sx={{ gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: BRAND.dark }}>
                {shown.hostname || shown.deviceId}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                <StatusChip status={shown.status} />
                <Typography variant="caption" sx={{ color: BRAND.textMuted }}>
                  {method?.label || shown.type}
                </Typography>
              </Stack>
            </Box>
            <Button size="small" onClick={onClose} startIcon={<CloseOutlinedIcon fontSize="small" />}>
              Close
            </Button>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {/* ── The access record, first ────────────────────────────── */}
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: BRAND.tealSoft,
              border: `1px solid ${BRAND.border}`
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark, mb: 1 }}>
              Access record
            </Typography>

            {loading && !detail ? <CircularProgress size={20} sx={{ color: BRAND.teal }} /> : null}

            {!loading && !record ? (
              <Typography variant="body2" sx={{ color: BRAND.textMuted }}>
                No record for this session. Reason and ticket became mandatory
                after this session ran, and historical sessions were deliberately
                not backfilled.
              </Typography>
            ) : null}

            {record ? (
              <Stack spacing={1.5}>
                <Field label="Reason">{record.reason}</Field>
                <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", gap: 1.5 }}>
                  <Field label="Ticket">{record.ticketRef}</Field>
                  <Field label="Operator">{shown.operator}</Field>
                  <Field label="Approval">
                    {record.approvalSource === "ungated"
                      ? "Not required"
                      : record.approverUserId || record.approvalSource}
                  </Field>
                </Stack>
              </Stack>
            ) : null}
          </Box>

          {/* ── The technical facts ─────────────────────────────────── */}
          <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", gap: 2 }}>
            <Field label="Started">
              {shown.startedAt ? new Date(shown.startedAt).toLocaleString() : null}
            </Field>
            <Field label="Ended">
              {shown.endedAt ? new Date(shown.endedAt).toLocaleString() : "In progress"}
            </Field>
            <Field label="Duration">{formatDuration(shown.durationSec)}</Field>
            <Field label="Device id">
              <Typography variant="caption" sx={{ color: BRAND.textMuted }}>
                {shown.deviceId}
              </Typography>
            </Field>
          </Stack>

          {/* Only when it says something. A NULL close_reason on a session
              that ended normally is not information. */}
          {detail?.closeReason ? (
            <Field label="Closed because">{detail.closeReason}</Field>
          ) : null}

          {shown.consentRequired ? (
            <Field label="User consent">
              {shown.consentOutcome === "denied"
                ? "Refused by the person at the device"
                : shown.consentOutcome === "timeout"
                  ? "No response from the person at the device"
                  : "Approved by the person at the device"}
            </Field>
          ) : null}

          {canReplay && onReplay ? (
            <Box>
              <Button
                variant="outlined"
                size="small"
                startIcon={<PlayCircleOutlineOutlinedIcon fontSize="small" />}
                onClick={() => onReplay(shown)}
              >
                {shown.type === "screen" ? "Play recording" : "Replay transcript"}
              </Button>
            </Box>
          ) : null}

          <Divider />

          {/* ── What moved during the session ───────────────────────── */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark, mb: 1 }}>
              Files transferred{transfers.length ? ` (${transfers.length})` : ""}
            </Typography>

            {transfers.length === 0 ? (
              <Typography variant="body2" sx={{ color: BRAND.gray }}>
                {loading ? "Loading…" : "No files moved in this session."}
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>File</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Direction</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Size</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transfers.map((t) => (
                    <TableRow key={t.transferId || t.id}>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: BRAND.dark }}>
                          {t.filename}
                        </Typography>
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          {t.remotePath}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textTransform: "capitalize" }}>{t.direction}</TableCell>
                      <TableCell>{formatBytes(t.sizeBytes)}</TableCell>
                      <TableCell sx={{ textTransform: "capitalize" }}>{t.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        </Box>
      ) : null}
    </Drawer>
  );
}
