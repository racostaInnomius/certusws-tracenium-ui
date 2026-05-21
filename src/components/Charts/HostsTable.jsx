// src/components/Charts/HostsTable.jsx
//
// Rendered inside AssetsDashboard's Devices section. Presents the
// `/dashboard/hosts` list with server-side pagination/search/sorting
// handled by the parent page and a compact enterprise table surface here.

import * as React from "react";
import {
  Box,
  Button,
  Checkbox,
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
  Tooltip,
  Typography,
} from "@mui/material";
import { BRAND } from "../../theme/brand";
import OnlineDot from "../common/OnlineDot";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";

const PLATFORM_STYLE = {
  windows: { bg: BRAND.darkSoft, fg: BRAND.dark },
  "windows-server": { bg: "rgba(37, 99, 235, 0.10)", fg: "#1d4ed8" },
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
function getDeviceLifecycleStatus(row = {}) {
  return String(
    row.lifecycleStatus ||
      row.deviceStatus ||
      row.status ||
      row.decommissionStatus ||
      row.decommission_status ||
      ""
  )
    .trim()
    .toUpperCase();
}

function isDeviceLockedForDecommission(row = {}) {
  return [
    "DELETION_PENDING",
    "DECOMMISSION_PENDING",
    "DECOMMISSIONING",
    "DECOMMISSIONED",
    "PURGE_PENDING",
    "PURGED",
  ].includes(getDeviceLifecycleStatus(row));
}

function getJobForDevice(jobs, agentId) {
  return jobs?.[String(agentId)] || null;
}

function formatJobStatus(status) {
  const value = String(status || "").trim().toUpperCase();
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function DecommissionStatusChip({ job, row }) {
  const lifecycleStatus = getDeviceLifecycleStatus(row);
  const status = String(job?.status || lifecycleStatus || "").toUpperCase();

  if (!status) return null;

  const isFailed = ["FAILED", "PARTIALLY_FAILED", "CANCELLED"].includes(status);
  const isCompleted = ["COMPLETED", "DECOMMISSIONED", "PURGED"].includes(status);

  return (
    <Chip
      size="small"
      label={formatJobStatus(status)}
      sx={{
        height: 20,
        fontSize: 10.5,
        fontWeight: 800,
        bgcolor: isFailed
          ? BRAND.alert.errorSoft
          : isCompleted
          ? BRAND.darkSoft
          : BRAND.alert.warningSoft,
        color: isFailed
          ? BRAND.alert.error
          : isCompleted
          ? BRAND.gray
          : BRAND.alert.warning,
        border: `1px solid ${
          isFailed
            ? BRAND.alert.error
            : isCompleted
            ? BRAND.gray
            : BRAND.alert.warning
        }33`,
      }}
    />
  );
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
  selectedForDecommissionIds = new Set(),
  decommissionJobs = {},
  onToggleDecommissionSelection,
  onDeleteDevice,
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
              <TableCell sx={{ fontWeight: 700, width: 48 }} />
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
              <TableCell sx={{ fontWeight: 700, width: 150, textAlign: "right" }}>
                Action
              </TableCell>
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
              const job = getJobForDevice(decommissionJobs, agentId);
              const lifecycleLocked = isDeviceLockedForDecommission(r);
              const jobActive = Boolean(job && !["COMPLETED", "FAILED", "PARTIALLY_FAILED", "CANCELLED"].includes(String(job.status || "").toUpperCase()));
              const rowLocked = lifecycleLocked || jobActive;
              const checked = selectedForDecommissionIds?.has?.(String(agentId)) === true;
              const canDelete = checked && !rowLocked;

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
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Tooltip
                      title={
                        rowLocked
                          ? "This device is already in a decommission lifecycle state."
                          : "Select this row to enable device delete."
                      }
                      arrow
                    >
                      <span>
                        <Checkbox
                          size="small"
                          checked={checked}
                          disabled={rowLocked}
                          onChange={() => onToggleDecommissionSelection?.(r)}
                          sx={{
                            p: 0.5,
                            color: BRAND.gray,
                            "&.Mui-checked": { color: BRAND.teal },
                          }}
                        />
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <OnlineDot online={online} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: BRAND.dark, minWidth: 180 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                      <Typography
                        component="span"
                        sx={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: BRAND.dark,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {displayText(hostname)}
                      </Typography>
                      <DecommissionStatusChip job={job} row={r} />
                    </Box>
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
                  <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                    <Tooltip
                      title={
                        rowLocked
                          ? "Device is already being decommissioned."
                          : checked
                          ? "Create a device decommission job."
                          : "Select the checkbox to enable delete."
                      }
                      arrow
                    >
                      <span>
                        <Button
                          size="small"
                          variant={canDelete ? "contained" : "outlined"}
                          color="error"
                          disabled={!canDelete}
                          startIcon={<DeleteOutlineRoundedIcon />}
                          onClick={() => onDeleteDevice?.(r)}
                          sx={{
                            minWidth: 112,
                            textTransform: "none",
                            fontWeight: 800,
                            borderRadius: 1.5,
                            ...(canDelete
                              ? {
                                  bgcolor: BRAND.alert.error,
                                  "&:hover": { bgcolor: "#991b1b" },
                                }
                              : {
                                  borderColor: BRAND.border,
                                  color: BRAND.gray,
                                }),
                          }}
                        >
                          Delete
                        </Button>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}

            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ color: "text.secondary", py: 4 }}>
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
