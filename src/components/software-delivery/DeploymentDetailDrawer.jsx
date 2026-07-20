// src/components/software-delivery/DeploymentDetailDrawer.jsx
//
// Drawer surface for one deployment: package snapshot, target,
// status pill, KPI bar of outcomes, per-device results grid, and
// an admin Cancel button when the deployment is non-terminal.

import * as React from "react";
import {
  Drawer,
  Box,
  Typography,
  Chip,
  IconButton,
  Stack,
  CircularProgress,
  Button,
  Divider,
  Tooltip,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import { BRAND, ROLE, DATAGRID_SX } from "../../theme/brand";
import { listDeploymentResults, cancelDeployment } from "../../api/softwareDelivery";

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "failed"]);

// Outcome → chip color. Mirrors the backend outcome enum exactly.
function outcomeChip(outcome) {
  const map = {
    success:           { label: "success",           bg: BRAND.alert?.successSoft, color: BRAND.alert?.success },
    already_installed: { label: "already installed", bg: BRAND.alert?.successSoft, color: BRAND.alert?.success },
    reboot_required:   { label: "reboot req'd",      bg: BRAND.alert?.warningSoft, color: BRAND.alert?.warning },
    pending:           { label: "pending",           bg: BRAND.darkSoft,           color: BRAND.gray },
    running:           { label: "running",           bg: BRAND.tealSoft,           color: BRAND.tealText },
    failed:            { label: "failed",            bg: BRAND.alert?.errorSoft,   color: BRAND.alert?.error },
    rejected:          { label: "rejected",          bg: BRAND.alert?.errorSoft,   color: BRAND.alert?.error },
    timed_out:         { label: "timed out",         bg: BRAND.alert?.errorSoft,   color: BRAND.alert?.error },
    cancelled:         { label: "cancelled",         bg: BRAND.darkSoft,           color: BRAND.gray },
  };
  const entry = map[outcome] || {
    label: outcome,
    bg: BRAND.darkSoft,
    color: BRAND.gray,
  };
  return (
    <Chip
      size="small"
      label={entry.label}
      sx={{
        height: 20,
        fontSize: 11,
        fontWeight: 700,
        bgcolor: entry.bg,
        color: entry.color,
      }}
    />
  );
}

function statusChip(status) {
  const map = {
    queued:    { bg: BRAND.darkSoft,           color: BRAND.gray },
    running:   { bg: BRAND.tealSoft,           color: BRAND.tealText },
    completed: { bg: BRAND.alert?.successSoft, color: BRAND.alert?.success },
    cancelled: { bg: BRAND.darkSoft,           color: BRAND.gray },
    failed:    { bg: BRAND.alert?.errorSoft,   color: BRAND.alert?.error },
  };
  const e = map[status] || { bg: BRAND.darkSoft, color: BRAND.gray };
  return (
    <Chip
      size="small"
      label={status}
      sx={{ fontWeight: 700, fontSize: 12, bgcolor: e.bg, color: e.color }}
    />
  );
}

function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function DeploymentDetailDrawer({
  open,
  deployment,
  canManage,
  notify,
  onChanged, // called after cancel — parent re-fetches
  onClose,
}) {
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const loadResults = React.useCallback(async () => {
    if (!deployment) return;
    setLoading(true);
    try {
      const res = await listDeploymentResults(deployment.id);
      setResults(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [deployment, notify]);

  React.useEffect(() => {
    if (open && deployment) {
      loadResults();
    } else {
      setResults([]);
    }
  }, [open, deployment, loadResults]);

  // Auto-refresh while the deployment is non-terminal so the operator
  // sees results stream in without manual reload.
  React.useEffect(() => {
    if (!open || !deployment) return undefined;
    if (TERMINAL_STATUSES.has(deployment.status)) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadResults();
    }, 8000);
    return () => clearInterval(id);
  }, [open, deployment, loadResults]);

  const handleCancel = async () => {
    if (!deployment) return;
    setCancelling(true);
    try {
      const res = await cancelDeployment(deployment.id);
      notify?.(
        "success",
        `Cancelled — ${res?.cancelledResults ?? 0} pending result(s) marked cancelled`
      );
      onChanged?.();
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  const counts = deployment?.counts || {};
  const pkg = deployment?.packageSnapshot || {};

  const rows = React.useMemo(
    () =>
      results.map((r) => ({
        id: r.id,
        ...r,
      })),
    [results]
  );

  const columns = [
    {
      field: "deviceId",
      headerName: "Device",
      flex: 1,
      minWidth: 220,
      renderCell: (params) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: BRAND.dark }}>
          {params.row.deviceId}
        </Typography>
      ),
    },
    {
      field: "outcome",
      headerName: "Outcome",
      width: 160,
      renderCell: (params) => outcomeChip(params.row.outcome),
    },
    {
      field: "exitCode",
      headerName: "Exit",
      width: 70,
      renderCell: (params) =>
        params.row.exitCode == null ? (
          <Typography sx={{ fontSize: 12, color: BRAND.gray }}>—</Typography>
        ) : (
          <Typography sx={{ fontFamily: "monospace", fontSize: 12 }}>
            {params.row.exitCode}
          </Typography>
        ),
    },
    {
      // Distribution Phase A/B — which tier served the bytes (dp/cdn/origin).
      field: "servedBy",
      headerName: "Source",
      width: 84,
      renderCell: (params) =>
        params.row.servedBy ? (
          <Chip
            size="small"
            label={params.row.servedBy}
            sx={{
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              bgcolor: params.row.servedBy === "dp" ? BRAND.tealSoft : BRAND.darkSoft,
              color: params.row.servedBy === "dp" ? BRAND.tealText : BRAND.dark,
            }}
          />
        ) : (
          <Typography sx={{ fontSize: 12, color: BRAND.gray }}>—</Typography>
        ),
    },
    {
      field: "startedAt",
      headerName: "Started",
      width: 140,
      renderCell: (params) => (
        <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
          {formatTime(params.row.startedAt)}
        </Typography>
      ),
    },
    {
      field: "finishedAt",
      headerName: "Finished",
      width: 140,
      renderCell: (params) => (
        <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
          {formatTime(params.row.finishedAt)}
        </Typography>
      ),
    },
    {
      field: "stderrExcerpt",
      headerName: "Detail",
      flex: 1.2,
      minWidth: 240,
      renderCell: (params) => {
        const text = params.row.stderrExcerpt;
        if (!text) return <Typography sx={{ fontSize: 12, color: BRAND.gray }}>—</Typography>;
        return (
          <Tooltip title={text} placement="left">
            <Typography
              sx={{
                fontSize: 11,
                fontFamily: "monospace",
                color: BRAND.gray,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {text}
            </Typography>
          </Tooltip>
        );
      },
    },
  ];

  const isTerminal = deployment ? TERMINAL_STATUSES.has(deployment.status) : true;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { sx: { width: { xs: "100%", sm: 640, lg: 760 }, p: 2, bgcolor: "#fff" } },
      }}
    >
      {deployment ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 800, color: BRAND.dark }}>
                Deployment #{deployment.id}
              </Typography>
              <Typography sx={{ fontSize: 13, color: BRAND.gray, mt: 0.25 }}>
                {pkg.name} v{pkg.version} · {pkg.platform}/{pkg.arch}/{(pkg.format || "").toUpperCase()}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                {statusChip(deployment.status)}
                <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
                  Created {formatTime(deployment.createdAt)}
                  {deployment.finishedAt ? ` · finished ${formatTime(deployment.finishedAt)}` : ""}
                </Typography>
              </Stack>
            </Box>
            <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
              <CloseOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Divider sx={{ borderColor: BRAND.border }} />

          {/* Counts strip */}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {[
              ["pending", BRAND.darkSoft, BRAND.gray],
              ["running", BRAND.tealSoft, BRAND.tealText],
              ["success", BRAND.alert?.successSoft, BRAND.alert?.success],
              ["already_installed", BRAND.alert?.successSoft, BRAND.alert?.success],
              ["reboot_required", BRAND.alert?.warningSoft, BRAND.alert?.warning],
              ["failed", BRAND.alert?.errorSoft, BRAND.alert?.error],
              ["rejected", BRAND.alert?.errorSoft, BRAND.alert?.error],
              ["timed_out", BRAND.alert?.errorSoft, BRAND.alert?.error],
              ["cancelled", BRAND.darkSoft, BRAND.gray],
            ].map(([key, bg, color]) => {
              const n = counts[key] || 0;
              if (n === 0) return null;
              return (
                <Chip
                  key={key}
                  size="small"
                  label={`${key.replace("_", " ")}: ${n}`}
                  sx={{
                    height: 22,
                    fontWeight: 700,
                    fontSize: 11,
                    bgcolor: bg,
                    color: color,
                  }}
                />
              );
            })}
          </Box>

          {/* Target summary */}
          <Box
            sx={{
              p: 1.25,
              borderRadius: 1,
              border: `1px solid ${BRAND.border}`,
              bgcolor: BRAND.surfaceMuted,
            }}
          >
            <Typography sx={{ fontSize: 12, color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Target
            </Typography>
            <Typography sx={{ fontSize: 13, color: BRAND.dark, mt: 0.25 }}>
              {deployment.targetKind === "asset_group"
                ? `Asset group #${deployment.assetGroupId ?? "?"}`
                : `Device list (${(deployment.deviceIds || []).length})`}
            </Typography>
          </Box>

          {/* Cancel + refresh */}
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography
              variant="caption"
              sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Per-device results ({rows.length})
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                onClick={loadResults}
                disabled={loading}
                sx={{ textTransform: "none", color: BRAND.gray }}
              >
                {loading ? "Loading…" : "Refresh"}
              </Button>
              {canManage && !isTerminal ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<StopCircleOutlinedIcon />}
                  onClick={handleCancel}
                  disabled={cancelling}
                  sx={{
                    textTransform: "none",
                    borderColor: ROLE?.critical || BRAND.alert?.error,
                    color: ROLE?.critical || BRAND.alert?.error,
                    "&:hover": { borderColor: BRAND.alert?.error, bgcolor: BRAND.alert?.errorSoft },
                  }}
                >
                  {cancelling ? "Cancelling…" : "Cancel"}
                </Button>
              ) : null}
            </Stack>
          </Stack>

          <Box sx={{ flex: 1, minHeight: 0 }}>
            {loading && rows.length === 0 ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <DataGrid
                rows={rows}
                columns={columns}
                density="compact"
                disableRowSelectionOnClick
                pageSizeOptions={[10, 25, 50]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                sx={DATAGRID_SX}
                autoHeight
              />
            )}
          </Box>
        </Box>
      ) : null}
    </Drawer>
  );
}
