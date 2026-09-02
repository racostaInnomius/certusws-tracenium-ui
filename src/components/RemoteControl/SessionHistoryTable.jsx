// src/components/RemoteControl/SessionHistoryTable.jsx
//
// Session history placeholder. Empty today — when `rcp` ships and
// sessions start flowing, this table populates. Shape is the one the
// backend already returns (see RemoteSession type in
// remote-control.service.ts).

import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";

const TYPE_LABEL = {
  shell: "Shell",
  file: "File transfer",
  screen: "Screen share"
};

const STATUS_META = {
  active:    { label: "Active",    fg: ROLE.positive, bg: ROLE.positiveSoft },
  completed: { label: "Completed", fg: BRAND.tealText, bg: BRAND.tealSoft },
  failed:    { label: "Failed",    fg: ROLE.critical, bg: ROLE.criticalSoft },
  cancelled: { label: "Cancelled", fg: BRAND.gray,    bg: BRAND.surfaceMuted }
};

// User-attended approval outcome per session. `consentRequired` says the session
// was gated on end-user consent; `consentOutcome` (from close_reason) says how it
// went. No outcome on a consent-required session ⇒ the user approved and it
// proceeded.
function ConsentCell({ consentRequired, consentOutcome }) {
  if (!consentRequired) {
    return <Typography variant="caption" sx={{ color: BRAND.gray }}>—</Typography>;
  }
  const meta =
    consentOutcome === "denied"
      ? { label: "Denied by user", fg: ROLE.critical, bg: ROLE.criticalSoft }
      : consentOutcome === "timeout"
      ? { label: "No response", fg: ROLE.caution, bg: ROLE.cautionSoft }
      : { label: "Approved", fg: ROLE.positive, bg: ROLE.positiveSoft };
  return (
    <Chip
      size="small"
      label={meta.label}
      sx={{ height: 20, fontWeight: 700, fontSize: TEXT.xs, bgcolor: meta.bg, color: meta.fg, border: `1px solid ${meta.fg}33` }}
    />
  );
}

function formatDuration(sec) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

export default function SessionHistoryTable({
  sessions,
  total,
  loading,
  // Sprint 3 — invoked when the operator clicks "Replay" on a row.
  // Parent passes a handler that mounts the TranscriptReplayDialog.
  onReplay
}) {
  const items = Array.isArray(sessions) ? sessions : [];

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            Session history
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Every session opened from this page is recorded here, with its transcript.
          </Typography>
        </Box>
        {total ? (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {total} total
          </Typography>
        ) : null}
      </Stack>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Started</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Device</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Operator</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Duration</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Consent</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Transcript</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ py: 5, border: "none" }}>
                  <Stack
                    alignItems="center"
                    spacing={1}
                    sx={{ color: BRAND.gray, textAlign: "center" }}
                  >
                    <HistoryOutlinedIcon sx={{ fontSize: ICON["2xl"], color: BRAND.gray }} />
                    <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
                      {loading
                        ? "Loading session history…"
                        : "No remote sessions recorded for this tenant."}
                    </Typography>
                    <Typography variant="caption" sx={{ color: BRAND.gray, maxWidth: 420 }}>
                      {/* This used to say the session history would fill up "once
                          the rcp plugin is deployed on at least one agent" — the
                          same stale premise the old PluginUnavailableCard carried,
                          on a page where the plugin has been working for months. */}
                      Sessions started from the Connect tab appear here with their full
                      transcript, for audit and compliance review.
                    </Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            ) : (
              items.map((s) => {
                const status = STATUS_META[s.status] || STATUS_META.cancelled;
                return (
                  <TableRow key={s.sessionId} hover>
                    <TableCell>
                      {s.startedAt ? new Date(s.startedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>{s.hostname || s.deviceId}</TableCell>
                    <TableCell>{s.operator || "—"}</TableCell>
                    <TableCell>{TYPE_LABEL[s.type] || s.type}</TableCell>
                    <TableCell>{formatDuration(s.durationSec)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={status.label}
                        sx={{
                          height: 20,
                          fontWeight: 700,
                          fontSize: TEXT.xs,
                          bgcolor: status.bg,
                          color: status.fg,
                          border: `1px solid ${status.fg}33`
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <ConsentCell
                        consentRequired={s.consentRequired}
                        consentOutcome={s.consentOutcome}
                      />
                    </TableCell>
                    <TableCell>
                      {/* Sprint 3 — Replay opens TranscriptReplayDialog.
                          We render the button on EVERY closed session,
                          letting the backend return 404 if no chunks
                          were recorded (rather than trusting the
                          stale hasTranscript flag from the list
                          payload). Only suppress for active sessions
                          since the transcript is still being uploaded. */}
                      {/* Replay solo para shell. El transcript es la salida del
                          terminal: `screen-session.ts` y la sesión de ficheros
                          no graban nada, así que ofrecer el botón ahí llevaba
                          siempre al vacío ("No transcript chunks were
                          recorded"). El operador no distingue eso de una
                          grabación perdida, y acaba dudando de la auditoría
                          entera — que sí funciona, en las sesiones de shell.
                          Grabar vídeo de una sesión de pantalla es otra
                          decisión, de coste y de retención, no un arreglo de
                          esta tabla. */}
                      {/* ADR-0012: las sesiones de PANTALLA ya pueden tener
                          grabación, pero solo se ofrece el botón cuando el
                          backend confirma que hay una SUBIDA (hasRecording).
                          La fila de la grabación se crea al entregar la clave
                          y el vídeo sube después, a veces días después: ofrecer
                          "Replay" en ese hueco llevaría al mismo vacío que
                          motivó quitar el botón de aquí en su día, y el
                          operador no lo distingue de una grabación perdida. */}
                      {s.status === "active" ||
                      !onReplay ||
                      (s.type !== "shell" && !(s.type === "screen" && s.hasRecording)) ? (
                        <span style={{ color: BRAND.gray }}>
                          {s.status === "active"
                            ? "In progress"
                            : s.type === "screen"
                              ? "Not recorded"
                              : s.type === "file"
                                ? "See transfers"
                                : "—"}
                        </span>
                      ) : (
                        <Button
                          size="small"
                          variant="text"
                          startIcon={
                            <PlayCircleOutlineOutlinedIcon
                              sx={{ fontSize: TEXT.lg }}
                            />
                          }
                          onClick={() => onReplay(s)}
                          sx={{ textTransform: "none", color: BRAND.tealText }}
                        >
                          Replay
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
