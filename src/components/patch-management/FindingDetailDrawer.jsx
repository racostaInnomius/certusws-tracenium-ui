// src/components/patch-management/FindingDetailDrawer.jsx
//
// Patch Management v2 — drawer surface for one finding aggregate.
// Opens when the operator clicks a row in the FindingsPanel grid.
//
// Two modes the drawer can be in (controlled via local state, not
// the parent — keeps the panel reload logic simple):
//
//   1. SELECT  — list of devices affected, checkbox-selectable.
//                Buttons: [Run dry-run on N] / [Apply on N].
//                Apply only enabled when the catalog flagged this
//                finding as agentRemediable.
//
//   2. PROGRESS — after the operator clicks one of the action
//                 buttons, we POST /remediate, get back a
//                 deployment-style row with `counts.pending=N`,
//                 then poll `/remediations/:id/results` every 5s
//                 until everything is in a terminal state. Each
//                 row shows its outcome chip + reason. The
//                 operator can [Close] anytime; closing doesn't
//                 cancel the in-flight job — `cancel` has its own
//                 button.

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
  Checkbox,
  Alert,
  Tabs,
  Tab,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";

import { BRAND, ROLE, DATAGRID_SX } from "../../theme/brand";
import { DataGrid } from "@mui/x-data-grid";
import {
  getDevicesAffectedByCheck,
  remediate,
  getRemediationResults,
  cancelRemediation,
} from "../../api/patchManagement";

// ── Helpers ───────────────────────────────────────────────────────

const TERMINAL_OUTCOMES = new Set([
  "applied",
  "already_compliant",
  "applied_reboot_required",
  "dryrun_would_apply",
  "dryrun_already_compliant",
  "failed",
  "rejected",
  "timed_out",
  "cancelled",
]);

function outcomeChip(outcome) {
  // Same color map the SDP drawer uses for its outcomes — ok/green,
  // pending/gray, failed/red, reboot/amber. Keeps PMv2 visually
  // consistent with SDP.
  const map = {
    applied:                  { label: "applied",          bg: BRAND.alert?.successSoft, color: BRAND.alert?.success },
    already_compliant:        { label: "compliant",        bg: BRAND.alert?.successSoft, color: BRAND.alert?.success },
    applied_reboot_required:  { label: "applied (reboot)", bg: BRAND.alert?.warningSoft, color: BRAND.alert?.warning },
    dryrun_would_apply:       { label: "would apply",      bg: BRAND.tealSoft,           color: BRAND.tealText },
    dryrun_already_compliant: { label: "already compliant",bg: BRAND.alert?.successSoft, color: BRAND.alert?.success },
    pending:                  { label: "pending",          bg: BRAND.darkSoft,           color: BRAND.gray },
    running:                  { label: "running",          bg: BRAND.tealSoft,           color: BRAND.tealText },
    failed:                   { label: "failed",           bg: BRAND.alert?.errorSoft,   color: BRAND.alert?.error },
    rejected:                 { label: "rejected",         bg: BRAND.alert?.errorSoft,   color: BRAND.alert?.error },
    timed_out:                { label: "timed out",        bg: BRAND.alert?.errorSoft,   color: BRAND.alert?.error },
    cancelled:                { label: "cancelled",        bg: BRAND.darkSoft,           color: BRAND.gray },
  };
  const e = map[outcome] || { label: outcome || "—", bg: BRAND.darkSoft, color: BRAND.gray };
  return (
    <Chip
      size="small"
      label={e.label}
      sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: e.bg, color: e.color }}
    />
  );
}

function severityChip(severity) {
  const map = {
    critical: { bg: BRAND.alert?.errorSoft,   color: BRAND.alert?.error },
    high:     { bg: BRAND.alert?.errorSoft,   color: BRAND.alert?.error },
    medium:   { bg: BRAND.alert?.warningSoft, color: BRAND.alert?.warning },
    low:      { bg: BRAND.tealSoft,           color: BRAND.tealText },
    info:     { bg: BRAND.darkSoft,           color: BRAND.gray },
  };
  const e = map[severity] || { bg: BRAND.darkSoft, color: BRAND.gray };
  return (
    <Chip
      size="small"
      label={severity || "—"}
      sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: e.bg, color: e.color }}
    />
  );
}

function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "2-digit", month: "short", day: "2-digit",
    hourCycle: "h23", hour: "2-digit", minute: "2-digit",
  });
}

// ── Main component ───────────────────────────────────────────────

export default function FindingDetailDrawer({
  open,
  finding,        // FindingAggregateRow row from the panel
  canManage,
  notify,
  onClose,
  onChanged,      // called after a successful remediate / cancel — parent reloads
}) {
  // Mode: select (default) or progress (after remediate)
  const [mode, setMode] = React.useState("select");

  // SELECT-mode state
  const [devices, setDevices] = React.useState([]);
  const [devicesLoading, setDevicesLoading] = React.useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = React.useState(() => new Set());
  const [submitting, setSubmitting] = React.useState(false);

  // PROGRESS-mode state
  const [activeRemediationId, setActiveRemediationId] = React.useState(null);
  const [results, setResults] = React.useState([]);
  const [resultsLoading, setResultsLoading] = React.useState(false);
  const [activeMode, setActiveMode] = React.useState("apply"); // 'apply' | 'dry_run'

  // Reset whenever the drawer opens with a different finding.
  React.useEffect(() => {
    if (!open) {
      setMode("select");
      setSelectedDeviceIds(new Set());
      setActiveRemediationId(null);
      setResults([]);
      return;
    }
    setMode("select");
    setSelectedDeviceIds(new Set());
    setActiveRemediationId(null);
    setResults([]);
  }, [open, finding?.checkId]);

  // ── SELECT-mode: load devices affected ──────────────────────────
  const loadDevices = React.useCallback(async () => {
    if (!finding?.checkId) return;
    setDevicesLoading(true);
    try {
      const res = await getDevicesAffectedByCheck(finding.checkId);
      const items = Array.isArray(res?.items) ? res.items : [];
      setDevices(items);
      // Default selection: all. Operator can deselect specific
      // ones before firing.
      setSelectedDeviceIds(new Set(items.map((d) => d.agentId)));
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Failed to load affected devices");
    } finally {
      setDevicesLoading(false);
    }
  }, [finding?.checkId, notify]);

  React.useEffect(() => {
    if (open && mode === "select" && finding?.checkId) {
      loadDevices();
    }
  }, [open, mode, finding?.checkId, loadDevices]);

  // ── PROGRESS-mode: poll results until terminal ──────────────────
  const loadResults = React.useCallback(async () => {
    if (!activeRemediationId) return;
    setResultsLoading(true);
    try {
      const res = await getRemediationResults(activeRemediationId);
      setResults(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Failed to load remediation results");
    } finally {
      setResultsLoading(false);
    }
  }, [activeRemediationId, notify]);

  React.useEffect(() => {
    if (mode !== "progress" || !activeRemediationId) return undefined;
    loadResults();
    // Poll every 5s until everything is terminal. We stop the
    // interval as soon as that's true to avoid hammering once the
    // remediation finishes — but the operator can also Refresh
    // manually.
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const allTerminal = results.length > 0
        && results.every((r) => TERMINAL_OUTCOMES.has(r.outcome));
      if (allTerminal) return;
      loadResults();
    }, 5000);
    return () => clearInterval(id);
  }, [mode, activeRemediationId, loadResults, results]);

  // ── Actions ─────────────────────────────────────────────────────
  const fire = async (theMode) => {
    if (!finding?.checkId || !canManage) return;
    if (selectedDeviceIds.size === 0) {
      notify?.("info", "Select at least one device first");
      return;
    }
    setSubmitting(true);
    try {
      const res = await remediate({
        checkId: finding.checkId,
        mode: theMode,
        deviceIds: Array.from(selectedDeviceIds),
      });
      const id = res?.remediation?.id;
      if (!id) {
        notify?.("error", "Backend didn't return a remediation id");
        return;
      }
      setActiveMode(theMode);
      setActiveRemediationId(id);
      setMode("progress");
      onChanged?.();
    } catch (err) {
      // Backend's well-known failure modes:
      //   PMP_PLUGIN_DISABLED → 403; banner on the page already
      //                         tells the operator how to fix it,
      //                         here we just surface the message.
      //   PATCH_REMEDIATION_EMPTY_TARGET → caller deselected
      //                                     everything between fetch
      //                                     and click (race), tell them.
      notify?.(
        "error",
        err?.body?.message || err?.body?.error || err?.message || "Remediation failed to start"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeRemediationId) return;
    try {
      const res = await cancelRemediation(activeRemediationId);
      notify?.(
        "success",
        `Cancelled — ${res?.cancelledResults ?? 0} pending result(s) marked cancelled`
      );
      loadResults();
      onChanged?.();
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Cancel failed");
    }
  };

  const toggleDevice = (agentId) => {
    setSelectedDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedDeviceIds.size === devices.length) {
      setSelectedDeviceIds(new Set());
    } else {
      setSelectedDeviceIds(new Set(devices.map((d) => d.agentId)));
    }
  };

  // ── Computed ────────────────────────────────────────────────────
  const isAgentRemediable = finding?.agentRemediable === true;
  const allTerminal = results.length > 0
    && results.every((r) => TERMINAL_OUTCOMES.has(r.outcome));

  // Aggregated counts for the progress header chip strip.
  const counts = React.useMemo(() => {
    const acc = {};
    for (const r of results) acc[r.outcome] = (acc[r.outcome] || 0) + 1;
    return acc;
  }, [results]);

  // Result grid columns
  const resultColumns = React.useMemo(() => [
    {
      field: "deviceId",
      headerName: "Device",
      flex: 1,
      minWidth: 220,
      renderCell: (p) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: BRAND.dark }}>
          {p.row.deviceId}
        </Typography>
      ),
    },
    {
      field: "outcome",
      headerName: "Outcome",
      width: 160,
      renderCell: (p) => outcomeChip(p.row.outcome),
    },
    {
      field: "exitCode",
      headerName: "Exit",
      width: 70,
      renderCell: (p) =>
        p.row.exitCode == null ? (
          <Typography sx={{ fontSize: 12, color: BRAND.gray }}>—</Typography>
        ) : (
          <Typography sx={{ fontSize: 12, fontFamily: "monospace" }}>{p.row.exitCode}</Typography>
        ),
    },
    {
      field: "finishedAt",
      headerName: "Finished",
      width: 140,
      renderCell: (p) => (
        <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
          {formatTime(p.row.finishedAt)}
        </Typography>
      ),
    },
    {
      field: "stderrExcerpt",
      headerName: "Detail",
      flex: 1.2,
      minWidth: 240,
      renderCell: (p) => {
        const text = p.row.stderrExcerpt;
        if (!text) return <Typography sx={{ fontSize: 12, color: BRAND.gray }}>—</Typography>;
        return (
          <Tooltip title={text} placement="left">
            <Typography
              sx={{
                fontSize: 11, fontFamily: "monospace", color: BRAND.gray,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {text}
            </Typography>
          </Tooltip>
        );
      },
    },
  ], []);

  // Convert to grid rows (DataGrid wants `id`).
  const resultRows = results.map((r) => ({ id: r.id, ...r }));

  // ── Render ──────────────────────────────────────────────────────

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { sx: { width: { xs: "100%", sm: 640, lg: 760 }, p: 2, bgcolor: "#fff" } },
      }}
    >
      {finding ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
          {/* Header */}
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                {severityChip(finding.severity)}
                <Typography sx={{ fontSize: 11, color: BRAND.gray, fontFamily: "monospace" }}>
                  {finding.checkId}
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 17, fontWeight: 800, color: BRAND.dark, mt: 0.5 }}>
                {finding.title || finding.checkId}
              </Typography>
              {finding.description ? (
                <Typography sx={{ fontSize: 13, color: BRAND.gray, mt: 0.5 }}>
                  {finding.description}
                </Typography>
              ) : null}
            </Box>
            <IconButton onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
              <CloseOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>

          {finding.remediationSummary ? (
            <Box
              sx={{
                p: 1.25,
                borderRadius: 1,
                bgcolor: BRAND.surfaceMuted,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}
              >
                Remediation
              </Typography>
              <Typography sx={{ fontSize: 13, color: BRAND.dark, mt: 0.25 }}>
                {finding.remediationSummary}
              </Typography>
            </Box>
          ) : null}

          {!isAgentRemediable ? (
            <Alert
              severity="info"
              sx={{
                bgcolor: BRAND.alert?.infoSoft,
                color: BRAND.dark,
                "& .MuiAlert-icon": { color: BRAND.teal },
              }}
            >
              The agent does not have a click-to-fix handler for this checkId. Devices affected are
              still listed below for reference; remediation must be done manually following the
              steps above.
            </Alert>
          ) : null}

          <Divider sx={{ borderColor: BRAND.border }} />

          {/* Mode toggle when in progress (lets the operator pop back to "select" without losing the deployment id — useful for re-applying after a partial run) */}
          {mode === "progress" ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                size="small"
                startIcon={<ArrowBackOutlinedIcon />}
                onClick={() => setMode("select")}
                sx={{ textTransform: "none", color: BRAND.gray }}
              >
                Back to selection
              </Button>
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                startIcon={<RefreshOutlinedIcon />}
                onClick={loadResults}
                disabled={resultsLoading}
                sx={{ textTransform: "none", color: BRAND.gray }}
              >
                {resultsLoading ? "Loading…" : "Refresh"}
              </Button>
              {!allTerminal ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<StopCircleOutlinedIcon />}
                  onClick={handleCancel}
                  sx={{
                    textTransform: "none",
                    borderColor: BRAND.alert?.error,
                    color: BRAND.alert?.error,
                    "&:hover": { borderColor: BRAND.alert?.error, bgcolor: BRAND.alert?.errorSoft },
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </Stack>
          ) : null}

          {/* SELECT MODE */}
          {mode === "select" ? (
            <>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography
                  variant="caption"
                  sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}
                >
                  Affected devices ({devices.length})
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    onClick={loadDevices}
                    disabled={devicesLoading}
                    sx={{ textTransform: "none", color: BRAND.gray }}
                  >
                    {devicesLoading ? "Loading…" : "Refresh"}
                  </Button>
                </Stack>
              </Stack>

              <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", border: `1px solid ${BRAND.border}`, borderRadius: 1 }}>
                {devicesLoading && devices.length === 0 ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : devices.length === 0 ? (
                  <Box sx={{ p: 3, textAlign: "center", color: BRAND.gray }}>
                    <Typography variant="body2">No devices currently failing this check.</Typography>
                  </Box>
                ) : (
                  <>
                    {/* Select-all row */}
                    <Box sx={{
                      display: "flex", alignItems: "center", px: 1, py: 0.5,
                      borderBottom: `1px solid ${BRAND.border}`, bgcolor: BRAND.surfaceMuted,
                    }}>
                      <Checkbox
                        size="small"
                        checked={devices.length > 0 && selectedDeviceIds.size === devices.length}
                        indeterminate={selectedDeviceIds.size > 0 && selectedDeviceIds.size < devices.length}
                        onChange={toggleAll}
                        sx={{
                          "&.Mui-checked": { color: BRAND.teal },
                          "&.MuiCheckbox-indeterminate": { color: BRAND.teal },
                        }}
                      />
                      <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
                        {selectedDeviceIds.size} of {devices.length} selected
                      </Typography>
                    </Box>

                    {devices.map((d) => {
                      const checked = selectedDeviceIds.has(d.agentId);
                      return (
                        <Box
                          key={d.agentId}
                          onClick={() => toggleDevice(d.agentId)}
                          sx={{
                            display: "flex", alignItems: "center", px: 1, py: 0.75,
                            borderBottom: `1px solid ${BRAND.border}`,
                            cursor: "pointer",
                            "&:hover": { bgcolor: BRAND.tealSoft },
                          }}
                        >
                          <Checkbox
                            size="small"
                            checked={checked}
                            onChange={() => toggleDevice(d.agentId)}
                            onClick={(e) => e.stopPropagation()}
                            sx={{ "&.Mui-checked": { color: BRAND.teal } }}
                          />
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.dark }}>
                              {d.hostname || d.agentId.slice(0, 16)}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: BRAND.gray, fontFamily: "monospace" }}>
                              {d.agentId}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontSize: 11, color: BRAND.gray, ml: 1 }}>
                            {d.platform || "—"}
                          </Typography>
                        </Box>
                      );
                    })}
                  </>
                )}
              </Box>

              {/* Action bar */}
              <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
                <Button
                  variant="outlined"
                  size="medium"
                  startIcon={
                    submitting && activeMode === "dry_run"
                      ? <CircularProgress size={14} sx={{ color: BRAND.teal }} />
                      : <VisibilityOutlinedIcon />
                  }
                  onClick={() => fire("dry_run")}
                  disabled={
                    submitting || !canManage || !isAgentRemediable
                    || selectedDeviceIds.size === 0
                  }
                  sx={{
                    textTransform: "none", fontWeight: 700,
                    borderColor: BRAND.teal, color: BRAND.tealText,
                    "&:hover": { bgcolor: BRAND.tealSoft, borderColor: BRAND.tealHover },
                  }}
                >
                  Dry-run on {selectedDeviceIds.size}
                </Button>
                <Button
                  variant="contained"
                  size="medium"
                  startIcon={
                    submitting && activeMode === "apply"
                      ? <CircularProgress size={14} sx={{ color: "#fff" }} />
                      : <PlayCircleOutlineOutlinedIcon />
                  }
                  onClick={() => fire("apply")}
                  disabled={
                    submitting || !canManage || !isAgentRemediable
                    || selectedDeviceIds.size === 0
                  }
                  sx={{
                    textTransform: "none", fontWeight: 700,
                    bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover },
                  }}
                >
                  Apply on {selectedDeviceIds.size}
                </Button>
              </Stack>
            </>
          ) : null}

          {/* PROGRESS MODE */}
          {mode === "progress" ? (
            <>
              <Box>
                <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
                  Remediation #{activeRemediationId} · mode:{" "}
                  <strong>{activeMode === "dry_run" ? "dry-run" : "apply"}</strong>
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.5 }}>
                  {Object.entries(counts).map(([k, v]) => (
                    <Chip
                      key={k}
                      size="small"
                      label={`${k.replace(/_/g, " ")}: ${v}`}
                      sx={{ height: 22, fontWeight: 700, fontSize: 11 }}
                    />
                  ))}
                </Stack>
              </Box>

              <Box sx={{ flex: 1, minHeight: 0 }}>
                {resultsLoading && results.length === 0 ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : (
                  <DataGrid
                    rows={resultRows}
                    columns={resultColumns}
                    density="compact"
                    disableRowSelectionOnClick
                    pageSizeOptions={[10, 25, 50]}
                    initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                    sx={DATAGRID_SX}
                    autoHeight
                  />
                )}
              </Box>
            </>
          ) : null}
        </Box>
      ) : null}
    </Drawer>
  );
}
