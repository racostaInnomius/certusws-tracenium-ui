// src/components/RemoteControl/FileTransfersAuditTable.jsx
//
// RCP M2.S2 — tenant-wide cross-session file transfer audit table.
//
// ⚠️ Los filtros son del SERVIDOR, no de la página que se ve.
//
// Filtraban en cliente sobre `transfers`, que desde la paginación es UNA
// página de 25 filas de un histórico de miles. "Status: failed" no
// enseñaba los fallos del tenant: enseñaba los fallos que hubiera entre
// las 25 más recientes, y la respuesta a "¿ha fallado alguna
// transferencia?" era "no" con la tabla vacía y el filtro puesto — un
// silencio indistinguible del bueno, en la pantalla de auditoría.
//
// El endpoint ya aceptaba direction/status/filename desde M2.S2; solo
// nadie se los mandaba. Ahora el componente es CONTROLADO: el estado vive
// en TransfersTab, que lo mete en la petición y vuelve a la página 1 al
// cambiarlo. Aquí no se descarta ninguna fila.
//
// Columns: Started · Device · Filename · Direction · Remote path · Size · Status · Session

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
 *   transfers  — FileTransferRecord[] (la página actual, ya filtrada por el backend)
 *   total      — number (total del backend PARA ESTOS filtros)
 *   loading    — bool
 *   filters    — { direction, status, filename } — "all" / "" para sin filtro
 *   onFiltersChange — (next) => void, con el objeto completo
 */
export default function FileTransfersAuditTable({
  transfers,
  total,
  loading,
  filters = {},
  onFiltersChange
}) {
  const dirFilter = filters.direction ?? "all";
  const statusFilter = filters.status ?? "all";
  const filenameFilter = filters.filename ?? "";

  const set = (patch) => {
    if (typeof onFiltersChange === "function") {
      onFiltersChange({
        direction: dirFilter,
        status: statusFilter,
        filename: filenameFilter,
        ...patch
      });
    }
  };

  // Lo que llega ES lo visible: filtrar otra vez aquí volvería a recortar
  // una página ya recortada.
  const visible = Array.isArray(transfers) ? transfers : [];

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
        {(total > 0 || visible.length > 0) ? (
          // `total` ya viene contado con los filtros aplicados, así que dice
          // cuántas coinciden en TODO el histórico y no cuántas caben aquí.
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {isFiltered
              ? `${total ?? visible.length} matching`
              : `${total ?? visible.length} total`}
          </Typography>
        ) : null}
      </Stack>

      {/* Filter toolbar */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Select
          size="small"
          value={dirFilter}
          onChange={(e) => set({ direction: e.target.value })}
          sx={{ fontSize: TEXT.sm, height: 32, minWidth: 140 }}
        >
          <MenuItem value="all">All directions</MenuItem>
          <MenuItem value="download">Download</MenuItem>
          <MenuItem value="upload">Upload</MenuItem>
        </Select>

        <Select
          size="small"
          value={statusFilter}
          onChange={(e) => set({ status: e.target.value })}
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
          onChange={(e) => set({ filename: e.target.value })}
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
              {/* The question this table exists to answer is "which file went
                  where" — and it used to answer only the first half. A
                  transfer hangs off its session, so the device is a join
                  away; without it the log reads as filenames with no
                  subject. */}
              <TableCell sx={{ fontWeight: 700, fontSize: TEXT.sm }}>Device</TableCell>
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
                <TableCell colSpan={8} sx={{ py: 5, border: "none" }}>
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

                    {/* Device — hostname when the inventory knows it, the id
                        otherwise. Never blank: "which machine" is the point. */}
                    <TableCell sx={{ fontSize: TEXT.sm, maxWidth: 170 }}>
                      <Tooltip title={t.deviceId || ""} placement="top">
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            color: BRAND.dark,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {t.hostname || t.deviceId || "—"}
                        </Typography>
                      </Tooltip>
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
