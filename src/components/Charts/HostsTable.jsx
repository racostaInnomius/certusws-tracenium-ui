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
import { BRAND, TEXT } from "../../theme/brand";
import { normalizePlatform, platformLabel, platformColor } from "../../utils/platform";
import OnlineDot from "../common/OnlineDot";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";

function PlatformChip({ platform }) {
  const normalized = normalizePlatform(platform);
  if (!normalized) {
    return (
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        —
      </Typography>
    );
  }

  const style = platformColor(normalized);
  const label = platformLabel(normalized);

  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 20,
        fontWeight: 700,
        fontSize: TEXT.xs,
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

function getJobStatus(job) {
  return String(job?.status || "").trim().toUpperCase();
}

function isJobActive(job) {
  return ["QUEUED", "PROCESSING", "DELETION_PENDING", "DECOMMISSIONING"].includes(
    getJobStatus(job)
  );
}

function isJobTerminalSuccess(job) {
  return ["COMPLETED", "DECOMMISSIONED"].includes(getJobStatus(job));
}

function isJobTerminalFailure(job) {
  return ["FAILED", "PARTIALLY_FAILED", "CANCELLED"].includes(getJobStatus(job));
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
  const progress = Number(job?.progress);
  const hasProgress = Number.isFinite(progress) && progress > 0 && progress < 100;
  const label = hasProgress
    ? `${formatJobStatus(status)} ${Math.round(progress)}%`
    : formatJobStatus(status);

  return (
    <Tooltip
      arrow
      title={
        job?.currentStep ||
        job?.errorMessage ||
        (isCompleted
          ? "Device decommission completed. The row will be removed from active devices."
          : isFailed
          ? "Device decommission did not complete."
          : "Device decommission is queued or processing.")
      }
    >
      <Chip
        size="small"
        label={label}
        sx={{
          height: 20,
          fontSize: TEXT.xs,
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
    </Tooltip>
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
  decommissionFadingIds = new Set(),
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
              const jobActive = isJobActive(job);
              const jobSuccess = isJobTerminalSuccess(job);
              const jobFailed = isJobTerminalFailure(job);
              const rowLocked = lifecycleLocked || jobActive || jobSuccess;
              const checked = selectedForDecommissionIds?.has?.(String(agentId)) === true;
              const canDelete = checked && !rowLocked;
              const isFadingAfterCompletion =
                decommissionFadingIds?.has?.(String(agentId)) === true;

              return (
                <TableRow
                  key={String(agentId || hostname)}
                  hover
                  selected={selected}
                  onClick={() => onRowClick?.(r)}
                  sx={{
                    cursor: onRowClick ? "pointer" : "default",
                    opacity: isFadingAfterCompletion ? 0.28 : 1,
                    transform: isFadingAfterCompletion ? "translateX(10px)" : "translateX(0)",
                    transition: "opacity 900ms ease, transform 900ms ease, background-color 160ms ease",
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
                  <TableCell sx={{ fontWeight: 600, color: BRAND.dark, minWidth: 220 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                        <Typography
                          component="span"
                          sx={{
                            fontSize: TEXT.md,
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

                      {jobActive ? (
                        <Box sx={{ mt: 0.5, maxWidth: 260 }}>
                          <Typography
                            sx={{
                              fontSize: TEXT.xs,
                              color: BRAND.gray,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {job.currentStep || "Device decommission is queued."}
                          </Typography>
                          {Number.isFinite(Number(job.progress)) && Number(job.progress) > 0 ? (
                            <LinearProgress
                              variant="determinate"
                              value={Math.max(0, Math.min(100, Number(job.progress)))}
                              sx={{
                                mt: 0.35,
                                height: 3,
                                borderRadius: 999,
                                bgcolor: BRAND.surfaceMuted,
                                "& .MuiLinearProgress-bar": { bgcolor: BRAND.alert.warning },
                              }}
                            />
                          ) : null}
                        </Box>
                      ) : null}

                      {jobFailed && job?.errorMessage ? (
                        <Typography
                          sx={{
                            mt: 0.4,
                            fontSize: TEXT.xs,
                            color: BRAND.alert.error,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 280,
                          }}
                        >
                          {job.errorMessage}
                        </Typography>
                      ) : null}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ minWidth: 110 }}>
                    <PlatformChip platform={platform} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: TEXT.sm, minWidth: 120 }}>
                    {displayText(agentVersion)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>{displayText(lastLogonUser)}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: TEXT.sm, minWidth: 130 }}>
                    {displayText(localIp)}
                  </TableCell>
                  <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                    <Tooltip
                      title={
                        rowLocked
                          ? "Device decommission is in progress. Status is shown on this row."
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
                                  "&:hover": { bgcolor: BRAND.alert.errorHover },
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
              fontSize: TEXT.sm,
              color: "text.secondary",
            },
          }}
        />
      </Box>
    </Box>
  );
}
