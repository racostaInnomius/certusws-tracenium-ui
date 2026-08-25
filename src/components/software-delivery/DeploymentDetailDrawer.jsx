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
import RestoreOutlinedIcon from "@mui/icons-material/RestoreOutlined";
import { DataGrid } from "@mui/x-data-grid";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import { BRAND, DATAGRID_SX, ROLE, TEXT } from "../../theme/brand";
import { listDeploymentResults, cancelDeployment } from "../../api/softwareDelivery";
import { listDeploymentSnapshots, revertSnapshot } from "../../api/patchManagement";
import {
  snapshotPresentation,
  bySnapshotDevice,
  isRevertable,
  summarise as summariseSnapshots,
} from "../patch-management/gateway/snapshotStatus";
import { listFrom } from "../../api/shape";

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
        fontSize: TEXT.xs,
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
      sx={{ fontWeight: 700, fontSize: TEXT.sm, bgcolor: e.bg, color: e.color }}
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
  // Pre-patch snapshots (ADR-0001). Loaded separately and joined by device, so
  // a tenant with no gateway simply sees an empty column instead of an error.
  const [snapshots, setSnapshots] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const loadResults = React.useCallback(async () => {
    if (!deployment) return;
    setLoading(true);
    try {
      const res = await listDeploymentResults(deployment.id);
      setResults(listFrom(res, { context: "deploymentResults" }));
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

  React.useEffect(() => {
    if (!deployment?.id) return;
    let cancelled = false;
    listDeploymentSnapshots(deployment.id)
      .then((res) => {
        if (!cancelled && res?.ok) setSnapshots(res.data?.snapshots ?? []);
      })
      .catch(() => {
        // A tenant without a gateway has nothing to show here; never let this
        // failure obscure the install results the drawer exists for.
      });
    return () => {
      cancelled = true;
    };
  }, [deployment?.id, results]);

  const snapshotByDevice = React.useMemo(() => bySnapshotDevice(snapshots), [snapshots]);
  const snapshotSummary = React.useMemo(() => summariseSnapshots(snapshots), [snapshots]);

  const doRevert = React.useCallback(
    async (snapshot, deviceId) => {
      if (
        !window.confirm(
          `Roll ${deviceId} back to its pre-patch snapshot?\n\n` +
            "This DISCARDS everything written to the VM since the snapshot was taken — " +
            "user data, other applications' state, unrelated changes. It cannot be undone."
        )
      ) {
        return;
      }
      const res = await revertSnapshot(snapshot.id);
      notify?.(
        res?.ok ? "info" : "error",
        res?.ok
          ? "Rollback queued — the gateway will revert the VM and report back."
          : res?.data?.message || "Could not queue the rollback."
      );
    },
    [notify]
  );

  const rows = React.useMemo(
    () =>
      results.map((r) => ({
        id: r.id,
        ...r,
        snapshot: snapshotByDevice.get(r.deviceId) ?? null,
      })),
    [results, snapshotByDevice]
  );

  const columns = [
    {
      field: "deviceId",
      headerName: "Device",
      flex: 1,
      minWidth: 220,
      renderCell: (params) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: TEXT.sm, color: BRAND.dark }}>
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
      // Pre-patch snapshot. Answers "can I roll this machine back?" — which is
      // the question a failed outcome immediately raises.
      field: "snapshot",
      headerName: "Rollback",
      width: 190,
      sortable: false,
      renderCell: (params) => {
        const snap = params.row.snapshot;
        const p = snapshotPresentation(snap);
        return (
          <Tooltip title={p.hint || ""}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Chip size="small" label={p.label} color={p.color} variant="outlined" />
              {canManage && isRevertable(snap) && (
                <Tooltip title="Roll this VM back to its pre-patch snapshot">
                  <IconButton
                    size="small"
                    aria-label={`Roll ${params.row.deviceId} back to its pre-patch snapshot`}
                    onClick={() => doRevert(snap, params.row.deviceId)}
                  >
                    <RestoreOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Tooltip>
        );
      },
    },
    {
      field: "exitCode",
      headerName: "Exit",
      width: 70,
      renderCell: (params) =>
        params.row.exitCode == null ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>—</Typography>
        ) : (
          <Typography sx={{ fontFamily: "monospace", fontSize: TEXT.sm }}>
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
              fontSize: TEXT.xs,
              fontWeight: 700,
              bgcolor: params.row.servedBy === "dp" ? BRAND.tealSoft : BRAND.darkSoft,
              color: params.row.servedBy === "dp" ? BRAND.tealText : BRAND.dark,
            }}
          />
        ) : (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>—</Typography>
        ),
    },
    {
      field: "startedAt",
      headerName: "Started",
      width: 140,
      renderCell: (params) => (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
          {formatTime(params.row.startedAt)}
        </Typography>
      ),
    },
    {
      field: "finishedAt",
      headerName: "Finished",
      width: 140,
      renderCell: (params) => (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
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
        if (!text) return <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>—</Typography>;
        return (
          <Tooltip title={text} placement="left">
            <Typography
              sx={{
                fontSize: TEXT.xs,
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
        paper: { sx: { width: { xs: "100%", sm: 640, lg: 760 }, p: 2, bgcolor: BRAND.surface } },
      }}
    >
      {deployment ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>
                Deployment #{deployment.id}
              </Typography>
              <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray, mt: 0.25 }}>
                {pkg.name} v{pkg.version} · {pkg.platform}/{pkg.arch}/{(pkg.format || "").toUpperCase()}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                {statusChip(deployment.status)}
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
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
                    fontSize: TEXT.xs,
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
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Target
            </Typography>
            <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark, mt: 0.25 }}>
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
              {snapshotSummary.total > 0 && (
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ ml: 1, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
                >
                  {/* The number that matters before a patch run: how many of
                      these machines have no way back. */}
                  · {snapshotSummary.protected} with rollback
                  {snapshotSummary.pending > 0 && `, ${snapshotSummary.pending} snapshotting`}
                  {snapshotSummary.unprotected > 0 && `, ${snapshotSummary.unprotected} unprotected`}
                </Typography>
              )}
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
