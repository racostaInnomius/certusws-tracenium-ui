// src/components/Charts/HostsTable.jsx
//
// Rendered inside AssetsDashboard's Devices section. Presents the
// `/dashboard/hosts` list with server-side pagination/search/sorting
// handled by the parent page and a compact enterprise table surface here.

import * as React from "react";
import {
  Box,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Typography,
} from "@mui/material";
import { BRAND } from "../../theme/brand";
import OnlineDot from "../common/OnlineDot";

const PLATFORM_STYLE = {
  windows: { bg: BRAND.darkSoft, fg: BRAND.dark },
  macos: { bg: BRAND.tealSoft, fg: BRAND.tealText },
  linux: { bg: "rgba(237,108,2,0.12)", fg: "#8a4400" },
};

function PlatformChip({ platform }) {
  const p = String(platform || "").trim().toLowerCase();
  if (!p) {
    return (
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        —
      </Typography>
    );
  }

  const style = PLATFORM_STYLE[p] || { bg: BRAND.surfaceMuted, fg: BRAND.dark };

  return (
    <Chip
      size="small"
      label={p}
      sx={{
        height: 20,
        fontWeight: 700,
        fontSize: 11,
        textTransform: "capitalize",
        bgcolor: style.bg,
        color: style.fg,
        border: `1px solid ${style.fg}33`,
      }}
    />
  );
}

function firstValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return value;
  }
  return undefined;
}

function displayText(value, fallback = "—") {
  const next = firstValue(value);
  return next === undefined ? fallback : next;
}

function getAgentId(row) {
  return firstValue(row?.agentId, row?.agent_id, row?.deviceId, row?.device_id);
}

function SortableHeadCell({ field, label, sortModel, onSortChange, sx }) {
  const activeSort = sortModel?.[0] || { field: "hostname", sort: "asc" };
  const active = activeSort.field === field;

  return (
    <TableCell sx={{ fontWeight: 700, ...sx }}>
      <TableSortLabel
        active={active}
        direction={active ? activeSort.sort || "asc" : "asc"}
        onClick={() => onSortChange?.(field)}
        sx={{
          "& .MuiTableSortLabel-icon": {
            color: `${BRAND.tealText} !important`,
          },
        }}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

export default function HostsTable({
  rows = [],
  connectedIds = new Set(),
  selectedAgentId = "",
  onRowClick,
  loading = false,
  page = 0,
  pageSize = 25,
  rowCount = 0,
  sortModel = [{ field: "hostname", sort: "asc" }],
  onPageChange,
  onPageSizeChange,
  onSortChange,
}) {
  return (
    <Box sx={{ width: "100%" }}>
      <TableContainer
        sx={{
          maxHeight: 520,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 2.5,
          overflow: "auto",
          position: "relative",
        }}
      >
        {loading ? (
          <LinearProgress
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 3,
              height: 3,
              bgcolor: "rgba(27,166,166,0.15)",
              "& .MuiLinearProgress-bar": { bgcolor: BRAND.teal },
            }}
          />
        ) : null}

        <Table stickyHeader size="small" aria-label="hosts table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Online</TableCell>
              <SortableHeadCell
                field="hostname"
                label="Hostname"
                sortModel={sortModel}
                onSortChange={onSortChange}
              />
              <SortableHeadCell
                field="osPlatform"
                label="Platform"
                sortModel={sortModel}
                onSortChange={onSortChange}
              />
              <SortableHeadCell
                field="agentVersion"
                label="Agent version"
                sortModel={sortModel}
                onSortChange={onSortChange}
              />
              <SortableHeadCell
                field="lastLogonUser"
                label="Last logon user"
                sortModel={sortModel}
                onSortChange={onSortChange}
              />
              <SortableHeadCell
                field="localIp"
                label="Local IP"
                sortModel={sortModel}
                onSortChange={onSortChange}
              />
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((r) => {
              const agentId = getAgentId(r);
              const online = connectedIds?.has?.(String(agentId)) === true;
              const selected = String(selectedAgentId || "") === String(agentId || "");
              const hostname = firstValue(r.hostname, r.host, agentId);
              const platform = firstValue(r.osPlatform, r.os_platform, r.platform);
              const agentVersion = firstValue(r.agentVersion, r.agent_version);
              const lastLogonUser = firstValue(r.lastLogonUser, r.last_logon_user);
              const localIp = firstValue(r.localIp, r.local_ip);

              return (
                <TableRow
                  key={String(agentId || hostname)}
                  hover
                  selected={selected}
                  onClick={() => onRowClick?.(r)}
                  sx={{
                    cursor: onRowClick ? "pointer" : "default",
                    transition: "background-color 160ms ease, transform 160ms ease",
                    "&:hover": {
                      backgroundColor: BRAND.rowHover,
                    },
                    "&.Mui-selected": {
                      backgroundColor: `${BRAND.tealSoft} !important`,
                    },
                    "&.Mui-selected:hover": {
                      backgroundColor: `${BRAND.tealSoftStrong} !important`,
                    },
                    "& > td": { borderBottom: `1px solid ${BRAND.border}` },
                  }}
                >
                  <TableCell>
                    <OnlineDot online={online} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: BRAND.dark, minWidth: 180 }}>
                    {displayText(hostname)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 110 }}>
                    <PlatformChip platform={platform} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12, minWidth: 120 }}>
                    {displayText(agentVersion)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>{displayText(lastLogonUser)}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12, minWidth: 130 }}>
                    {displayText(localIp)}
                  </TableCell>
                </TableRow>
              );
            })}

            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ color: "text.secondary", py: 4 }}>
                  No hosts found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          borderLeft: `1px solid ${BRAND.border}`,
          borderRight: `1px solid ${BRAND.border}`,
          borderBottom: `1px solid ${BRAND.border}`,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        <TablePagination
          component="div"
          count={Number(rowCount || 0)}
          page={Number(page || 0)}
          rowsPerPage={Number(pageSize || 25)}
          onPageChange={(_, nextPage) => onPageChange?.(nextPage)}
          onRowsPerPageChange={(event) => onPageSizeChange?.(Number(event.target.value))}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="Rows"
          sx={{
            border: 0,
            "& .MuiTablePagination-toolbar": {
              flexWrap: "wrap",
              rowGap: 1,
            },
            "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
              fontSize: 12,
              color: "text.secondary",
            },
          }}
        />
      </Box>
    </Box>
  );
}
