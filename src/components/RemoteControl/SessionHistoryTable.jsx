// src/components/RemoteControl/SessionHistoryTable.jsx
//
// Session history placeholder. Empty today — when `rcp` ships and
// sessions start flowing, this table populates. Shape is the one the
// backend already returns (see RemoteSession type in
// remote-control.service.ts).

import {
  Box,
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
import { BRAND, ROLE } from "../../theme/brand";

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

export default function SessionHistoryTable({ sessions, total, loading }) {
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
            Every remote session + recorded transcripts appear here once the plugin is active.
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
              <TableCell sx={{ fontWeight: 700 }}>Transcript</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 5, border: "none" }}>
                  <Stack
                    alignItems="center"
                    spacing={1}
                    sx={{ color: BRAND.gray, textAlign: "center" }}
                  >
                    <HistoryOutlinedIcon sx={{ fontSize: 36, color: BRAND.gray }} />
                    <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
                      {loading
                        ? "Loading session history…"
                        : "No remote sessions recorded for this tenant."}
                    </Typography>
                    <Typography variant="caption" sx={{ color: BRAND.gray, maxWidth: 420 }}>
                      Once the Remote Control plugin (`rcp`) is deployed on at least one agent,
                      every session opened from this page will appear here with full transcript
                      for audit and compliance review.
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
                          fontSize: 11,
                          bgcolor: status.bg,
                          color: status.fg,
                          border: `1px solid ${status.fg}33`
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {s.hasTranscript ? "Available" : "—"}
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
