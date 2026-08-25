// src/components/RemoteControl/FileTransfersAuditTable.jsx
//
// RCP M2.S2 — tenant-wide cross-session file transfer audit table.
//
// Receives the transfer list from the parent (RemoteControl page)
// and provides client-side direction / status / filename filtering.
// The parent passes `transfers` fetched from GET /file-transfers
// (getAllFileTransfers); this component never fetches independently.
//
// Columns: Started · Filename · Direction · Remote path · Size · Status · Session

import * as React from "react";
import {
  Box,
  Chip,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import UploadOutlinedIcon from "@mui/icons-material/UploadOutlined";

import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ── Status styling ─────────────────────────────────────────────────────────

const STATUS_META = {
  started:   { label: "Active",    fg: ROLE.caution,  bg: ROLE.cautionSoft  },
  completed: { label: "Completed", fg: ROLE.positive, bg: ROLE.positiveSoft },
  failed:    { label: "Failed",    fg: ROLE.critical, bg: ROLE.criticalSoft },
  cancelled: { label: "Cancelled", fg: BRAND.gray,    bg: BRAND.surfaceMuted }
};

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Props:
 *   transfers  — FileTransferRecord[]
 *   total      — number (backend total before any limit)
 *   loading    — bool
 */
export default function FileTransfersAuditTable({ transfers, total, loading }) {
  const [dirFilter, setDirFilter]         = React.useState("all");
  const [statusFilter, setStatusFilter]   = React.useState("all");
  const [filenameFilter, setFilenameFilter] = React.useState("");

  const items = Array.isArray(transfers) ? transfers : [];

  const visible = items.filter((t) => {
    if (dirFilter !== "all" && t.direction !== dirFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (filenameFilter.trim()) {
      const q = filenameFilter.trim().toLowerCase();
      if (!t.filename?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const isFiltered =
    dirFilter !== "all" || statusFilter !== "all" || filenameFilter.trim().length > 0;

  return (
    <Paper
      elevation={0}
      sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            File transfer audit
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Cross-session record of every file sent or received via rcp.file sessions.
          </Typography>
        </Box>
        {(total > 0 || items.length > 0) ? (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {isFiltered
              ? `${visible.length} of ${total ?? items.length}`
              : `${total ?? items.length} total`}
          </Typography>
        ) : null}
      </Stack>

      {/* Filter toolbar */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Select
          size="small"
          value={dirFilter}
          onChange={(e) => setDirFilter(e.target.value)}
          sx={{ fontSize: TEXT.sm, height: 32, minWidth: 140 }}
        >
          <MenuItem value="all">All directions</MenuItem>
          <MenuItem value="download">Download</MenuItem>
          <MenuItem value="upload">Upload</MenuItem>
        </Select>

        <Select
          size="small"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ fontSize: TEXT.sm, height: 32, minWidth: 150 }}
        >
          <MenuItem value="all">All statuses</MenuItem>
          <MenuItem value="started">Active</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="failed">Failed</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </Select>

        <TextField
          size="small"
          placeholder="Filter filename…"
          value={filenameFilter}
          onChange={(e) => setFilenameFilter(e.target.value)}
          sx={{
            "& .MuiInputBase-input": { fontSize: TEXT.sm, py: "5px" },
            minWidth: 180
          }}
        />
      </Stack>

      {/* Table */}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: TEXT.sm }}>Started</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: TEXT.sm }}>Filename</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: TEXT.sm }}>Direction</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: TEXT.sm }}>Remote path</TableCell>
              <TableCell
                sx={{ fontWeight: 700, fontSize: TEXT.sm, width: 90 }}
                align="right"
              >
                Size
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: TEXT.sm, width: 120 }}>
                Status
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: TEXT.sm, width: 110 }}>
                Session
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 5, border: "none" }}>
                  <Stack
                    alignItems="center"
                    spacing={1}
                    sx={{ color: BRAND.gray, textAlign: "center" }}
                  >
                    <FolderOutlinedIcon sx={{ fontSize: ICON["2xl"], color: BRAND.gray }} />
                    <Typography
                      variant="body2"
                      sx={{ color: BRAND.dark, fontWeight: 600 }}
                    >
                      {loading
                        ? "Loading file transfer audit…"
                        : isFiltered
                        ? "No transfers match the current filters."
                        : "No file transfers recorded yet."}
                    </Typography>
                    {!loading && !isFiltered && (
                      <Typography
                        variant="caption"
                        sx={{ color: BRAND.gray, maxWidth: 440 }}
                      >
                        Every file uploaded to or downloaded from a managed device
                        via an rcp.file session will appear here for audit and
                        compliance review.
                      </Typography>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((t) => {
                const sm = STATUS_META[t.status] ?? STATUS_META.cancelled;
                return (
                  <TableRow key={t.id ?? t.transferId} hover>
                    {/* Started */}
                    <TableCell sx={{ fontSize: TEXT.sm, whiteSpace: "nowrap" }}>
                      {t.startedAt
                        ? new Date(t.startedAt).toLocaleString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })
                        : "—"}
                    </TableCell>

                    {/* Filename */}
                    <TableCell sx={{ fontSize: TEXT.sm, maxWidth: 200 }}>
                      <Tooltip title={t.remotePath || t.filename || ""} placement="top">
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            fontWeight: 600,
                            color: BRAND.dark,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 200
                          }}
                        >
                          {t.filename || "—"}
                        </Typography>
                      </Tooltip>
                    </TableCell>

                    {/* Direction */}
                    <TableCell sx={{ fontSize: TEXT.sm }}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {t.direction === "download" ? (
                          <DownloadOutlinedIcon
                            sx={{ fontSize: TEXT.base, color: BRAND.teal, flexShrink: 0 }}
                          />
                        ) : (
                          <UploadOutlinedIcon
                            sx={{ fontSize: TEXT.base, color: BRAND.teal, flexShrink: 0 }}
                          />
                        )}
                        <Typography
                          variant="caption"
                          sx={{ textTransform: "capitalize" }}
                        >
                          {t.direction}
                        </Typography>
                      </Stack>
                    </TableCell>

                    {/* Remote path */}
                    <TableCell sx={{ fontSize: TEXT.sm, maxWidth: 240 }}>
                      <Tooltip title={t.remotePath || ""} placement="top">
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            fontFamily: "monospace",
                            color: BRAND.gray,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 240
                          }}
                        >
                          {t.remotePath || "—"}
                        </Typography>
                      </Tooltip>
                    </TableCell>

                    {/* Size */}
                    <TableCell
                      align="right"
                      sx={{ fontSize: TEXT.sm, color: BRAND.gray, whiteSpace: "nowrap" }}
                    >
                      {t.status === "completed"
                        ? formatBytes(t.transferredBytes ?? t.sizeBytes)
                        : t.sizeBytes != null
                        ? formatBytes(t.sizeBytes)
                        : "—"}
                    </TableCell>

                    {/* Status + error hint */}
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Chip
                          size="small"
                          label={sm.label}
                          sx={{
                            height: 20,
                            fontWeight: 700,
                            fontSize: TEXT.xs,
                            bgcolor: sm.bg,
                            color: sm.fg,
                            border: `1px solid ${sm.fg}33`
                          }}
                        />
                        {t.errorMessage && (
                          <Tooltip title={t.errorMessage} placement="top">
                            <Typography
                              variant="caption"
                              sx={{
                                color: ROLE.critical,
                                cursor: "help",
                                lineHeight: 1,
                                userSelect: "none"
                              }}
                            >
                              ⓘ
                            </Typography>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>

                    {/* Session ID (truncated) */}
                    <TableCell sx={{ fontSize: TEXT.sm, maxWidth: 110 }}>
                      <Tooltip title={t.sessionId || ""} placement="top">
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            fontFamily: "monospace",
                            color: BRAND.gray,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 100
                          }}
                        >
                          {t.sessionId ? `${t.sessionId.slice(0, 8)}…` : "—"}
                        </Typography>
                      </Tooltip>
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
