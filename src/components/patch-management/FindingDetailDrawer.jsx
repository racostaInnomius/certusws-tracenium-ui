// src/components/patch-management/FindingDetailDrawer.jsx
//
// Patch Management v2 — drawer surface for one finding aggregate.
// Opens when the operator clicks a row in the FindingsPanel grid.
//
// Two modes the drawer can be in (controlled via local state, not
// the parent — keeps the panel reload logic simple):
//
//   1. SELECT  — list of devices affected, checkbox-selectable.
//                Button: [Dry-run on N] only — enabled when the catalog
//                flagged this finding as agentRemediable. There is no
//                Apply here on purpose (see dryRunGate.js).
//
//   2. PROGRESS — after the dry-run (and, once every device has
//                 answered, [Apply on the N that would change]), we POST /remediate, get back a
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
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";

import { BRAND, DATAGRID_SX, TEXT } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { DataGrid } from "@mui/x-data-grid";
import ActionOutlookNotice from "./ActionOutlookNotice";
import {
  getDevicesAffectedByCheck,
  remediate,
  getRemediationResults,
  cancelRemediation,
  listRemediations,
} from "../../api/patchManagement";
import { formatRelativeTime } from "../Compliance/PatchLevel";
import { listFrom } from "../../api/shape";
import { devicesToApplyAfterDryRun, dryRunFinished, dryRunLeftOut } from "./dryRunGate";

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
      sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: e.bg, color: e.color }}
    />
  );
}

function severityChip(severity) {
  // Canonical severity scale (theme/severity.js) — High was red (== Critical).
  const m = severityMeta(severity);
  const e = { bg: m.bg, color: m.fg };
  return (
    <Chip
      size="small"
      label={severity || "—"}
      sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: e.bg, color: e.color }}
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
  // Opcionales, para los otros caminos que llegan aquí (hub «Fix», «Fix now»
  // de un equipo y «Fix N» de flota en Security Compliance):
  checkIds = null,         // acción agrupada: los equipos son la UNIÓN de sus checks
  initialDeviceIds = null, // preseleccionar sólo éstos (p. ej. el equipo abierto)
  notice = null,           // aviso propio del llamante, encima del botón
  neverExercised = false,  // el hub sabe si este fix no se ha ejercido nunca aquí
}) {
  // Mode: select (default) or progress (after remediate)
  const [mode, setMode] = React.useState("select");
  const checkIdsKey = (checkIds ?? []).join(",");
  const initialKey = (initialDeviceIds ?? []).join(",");

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
  // La última simulación de ESTE check, si la hay. El cajón se abre en blanco
  // cada vez, así que sin esto una simulación ya hecha se perdía de vista y
  // había que repetirla para llegar al Apply acotado.
  const [lastDryRun, setLastDryRun] = React.useState(null);

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
  }, [open, finding?.checkId, checkIdsKey, initialKey]);

  // ── SELECT-mode: load devices affected ──────────────────────────
  // `notify` suele llegar como flecha nueva en cada render del padre: por ref,
  // para que no rehaga loadDevices/loadResults (recargar equipos o relanzar el sondeo) a cada pintado.
  const notifyRef = React.useRef(notify);
  notifyRef.current = notify;
  const resultsRef = React.useRef(results);
  resultsRef.current = results;

  const loadDevices = React.useCallback(async () => {
    if (!finding?.checkId) return;
    setDevicesLoading(true);
    try {
      // Una acción agrupada (tres perfiles de firewall, un handler) toca la
      // UNIÓN de equipos de sus checks: con sólo el primero se quedaría fuera
      // el equipo que falla el segundo y no el primero.
      const ids = checkIdsKey ? checkIdsKey.split(",") : [finding.checkId];
      const lists = await Promise.all(
        ids.map(async (id) => listFrom(await getDevicesAffectedByCheck(id), { context: "findingDetail" }))
      );
      const byId = new Map();
      for (const list of lists) for (const d of list) if (d?.agentId && !byId.has(d.agentId)) byId.set(d.agentId, d);
      const items = Array.from(byId.values());
      setDevices(items);
      // Selección por defecto: todos, o sólo los que pidió el llamante (el
      // equipo abierto). Se puede cambiar antes de simular.
      const wanted = initialKey ? new Set(initialKey.split(",")) : null;
      setSelectedDeviceIds(new Set(items.map((d) => d.agentId).filter((id) => !wanted || wanted.has(id))));
    } catch (err) {
      notifyRef.current?.("error", err?.body?.message || err?.message || "Failed to load affected devices");
    } finally {
      setDevicesLoading(false);
    }
  }, [finding?.checkId, checkIdsKey, initialKey]);

  React.useEffect(() => {
    if (open && mode === "select" && finding?.checkId) {
      loadDevices();
    }
  }, [open, mode, finding?.checkId, loadDevices]);

  // ¿Hay ya una simulación de este check? Se busca al abrir para poder volver
  // a su resultado en vez de repetirla — que es lo que pasaba al entrar de
  // nuevo desde Security Compliance.
  React.useEffect(() => {
    if (!open || !finding?.checkId) { setLastDryRun(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await listRemediations({ checkId: finding.checkId, limit: 10 });
        const prev = listFrom(res, { context: "findingDetailHistory" })
          .filter((r) => r?.mode === "dry_run" && r?.id)
          .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0] ?? null;
        if (!cancelled) setLastDryRun(prev);
      } catch {
        // El historial es una comodidad: si no carga, el cajón sigue
        // funcionando como si no hubiera simulación previa.
        if (!cancelled) setLastDryRun(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, finding?.checkId]);

  // ── PROGRESS-mode: poll results until terminal ──────────────────
  const loadResults = React.useCallback(async () => {
    if (!activeRemediationId) return;
    setResultsLoading(true);
    try {
      const res = await getRemediationResults(activeRemediationId);
      setResults(listFrom(res, { context: "findingDetailResults" }));
    } catch (err) {
      notifyRef.current?.("error", err?.body?.message || err?.message || "Failed to load remediation results");
    } finally {
      setResultsLoading(false);
    }
  }, [activeRemediationId]);

  React.useEffect(() => {
    if (mode !== "progress" || !activeRemediationId) return undefined;
    loadResults();
    // Poll every 5s until everything is terminal. We stop the
    // interval as soon as that's true to avoid hammering once the
    // remediation finishes — but the operator can also Refresh
    // manually.
    //
    // ⚠️ `results` se lee por ref. Con `results` en las dependencias, cada
    // respuesta relanzaba el efecto y éste pedía otra vez EN EL ACTO: una
    // petición detrás de otra, no un sondeo cada 5 s.
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const current = resultsRef.current;
      const allTerminal = current.length > 0
        && current.every((r) => TERMINAL_OUTCOMES.has(r.outcome));
      if (allTerminal) return;
      loadResults();
    }, 5000);
    return () => clearInterval(id);
  }, [mode, activeRemediationId, loadResults]);

  // ── Actions ─────────────────────────────────────────────────────
  const fire = async (theMode, targetIds = null) => {
    if (!finding?.checkId || !canManage) return;
    // Tras una simulación, `apply` va a los equipos que ELLA marcó. Sin
    // simulación previa va a la selección: simular primero se recomienda, no
    // se impone — quien conoce el fix no tiene por qué dar dos vueltas.
    const targets = Array.isArray(targetIds) && targetIds.length > 0
      ? targetIds
      : Array.from(selectedDeviceIds);
    if (targets.length === 0) {
      notify?.("info", "Select at least one device first");
      return;
    }
    setSubmitting(true);
    try {
      const res = await remediate({
        checkId: finding.checkId,
        mode: theMode,
        deviceIds: targets,
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
  const dryRunDone = activeMode === "dry_run" && dryRunFinished(results);
  const applyTargets = dryRunDone ? devicesToApplyAfterDryRun(results) : [];
  const leftOut = dryRunDone ? dryRunLeftOut(results) : null;

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
        <Typography sx={{ fontFamily: "monospace", fontSize: TEXT.sm, color: BRAND.dark }}>
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
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>—</Typography>
        ) : (
          <Typography sx={{ fontSize: TEXT.sm, fontFamily: "monospace" }}>{p.row.exitCode}</Typography>
        ),
    },
    {
      field: "finishedAt",
      headerName: "Finished",
      width: 140,
      renderCell: (p) => (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
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
        if (!text) return <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>—</Typography>;
        return (
          <Tooltip title={text} placement="left">
            <Typography
              sx={{
                fontSize: TEXT.xs, fontFamily: "monospace", color: BRAND.gray,
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
                <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace" }}>
                  {finding.checkId}
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark, mt: 0.5 }}>
                {finding.title || finding.checkId}
              </Typography>
              {finding.description ? (
                <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray, mt: 0.5 }}>
                  {finding.description}
                </Typography>
              ) : null}
            </Box>
            <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
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
              <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark, mt: 0.25 }}>
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
                      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
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
                            <Typography sx={{ fontSize: TEXT.md, fontWeight: 600, color: BRAND.dark }}>
                              {d.hostname || d.agentId.slice(0, 16)}
                            </Typography>
                            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace" }}>
                              {d.agentId}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, ml: 1 }}>
                            {d.platform || "—"}
                          </Typography>
                        </Box>
                      );
                    })}
                  </>
                )}
              </Box>

              {/* What pressing these buttons would actually do — when it
                  dispatches, what gets snapshotted, whether it can be undone.
                  Directly above the buttons on purpose: it answers the
                  questions people ask themselves in the second before they
                  click, and it used to live two tabs away. */}
              <Box sx={{ pt: 1 }}>
                <ActionOutlookNotice deviceIds={Array.from(selectedDeviceIds)} />
              </Box>

              {notice ? <Box sx={{ pt: 1 }}>{notice}</Box> : null}

              {/* La simulación que ya se hizo. Sin esto, volver a entrar aquí
                  desde Security Compliance obligaba a repetirla para llegar al
                  «Apply en los que cambiarían». */}
              {lastDryRun ? (
                <Stack
                  direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap
                  data-testid="last-dry-run"
                  sx={{ pt: 1 }}
                >
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                    Already dry-run {formatRelativeTime(lastDryRun.createdAt)} (#{lastDryRun.id}, {lastDryRun.status}).
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => {
                      setActiveMode("dry_run");
                      setActiveRemediationId(lastDryRun.id);
                      setResults([]);
                      setMode("progress");
                    }}
                    sx={{ textTransform: "none", fontWeight: 700 }}
                  >
                    Open its result
                  </Button>
                </Stack>
              ) : null}

              {/* Action bar — dos caminos, y el operador elige. Simular sigue
                  siendo lo recomendado (queda primero y resaltado), pero
                  aplicar directo está aquí: obligar a simular convertía cada
                  fix conocido en dos vueltas, y al volver a entrar el cajón
                  empezaba otra vez por la simulación aunque ya estuviera
                  hecha. */}
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ pt: 1 }} flexWrap="wrap" useFlexGap>
                <Button
                  variant="contained"
                  size="medium"
                  startIcon={
                    submitting && activeMode === "dry_run"
                      ? <CircularProgress size={14} sx={{ color: BRAND.surface }} />
                      : <VisibilityOutlinedIcon />
                  }
                  onClick={() => fire("dry_run")}
                  disabled={
                    submitting || !canManage || !isAgentRemediable
                    || selectedDeviceIds.size === 0
                  }
                  sx={{
                    textTransform: "none", fontWeight: 700, flexShrink: 0,
                    bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover },
                  }}
                >
                  Dry-run on {selectedDeviceIds.size}
                </Button>
                <Button
                  variant="outlined"
                  size="medium"
                  startIcon={
                    submitting && activeMode === "apply"
                      ? <CircularProgress size={14} />
                      : <PlayCircleOutlineOutlinedIcon />
                  }
                  onClick={() => fire("apply")}
                  disabled={
                    submitting || !canManage || !isAgentRemediable
                    || selectedDeviceIds.size === 0
                  }
                  sx={{ textTransform: "none", fontWeight: 700, flexShrink: 0 }}
                >
                  Apply on {selectedDeviceIds.size}
                </Button>
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, flex: "1 1 240px" }}>
                  {neverExercised
                    ? "This fix has never run on this installation — the dry-run changes nothing and tells you which devices it would touch."
                    : "The dry-run changes nothing: apply then goes only to the devices it says would change."}
                </Typography>
              </Stack>
            </>
          ) : null}

          {/* PROGRESS MODE */}
          {mode === "progress" ? (
            <>
              <Box>
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                  Remediation #{activeRemediationId} · mode:{" "}
                  <strong>{activeMode === "dry_run" ? "dry-run" : "apply"}</strong>
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.5 }}>
                  {Object.entries(counts).map(([k, v]) => (
                    <Chip
                      key={k}
                      size="small"
                      label={`${k.replace(/_/g, " ")}: ${v}`}
                      sx={{ height: 22, fontWeight: 700, fontSize: TEXT.xs }}
                    />
                  ))}
                </Stack>
              </Box>

              {activeMode === "dry_run" ? (
                <Box
                  sx={{ p: 1.5, borderRadius: 1, border: `1px solid ${BRAND.border}`, bgcolor: BRAND.surfaceMuted }}
                  data-testid="apply-after-dry-run"
                >
                  {!dryRunDone ? (
                    <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                      Waiting for every device to report its dry-run. Apply unlocks when they have.
                    </Typography>
                  ) : (
                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Button
                        variant="contained"
                        size="medium"
                        startIcon={<PlayCircleOutlineOutlinedIcon />}
                        onClick={() => fire("apply", applyTargets)}
                        disabled={submitting || !canManage || applyTargets.length === 0}
                        sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
                      >
                        Apply on {applyTargets.length} {applyTargets.length === 1 ? "device" : "devices"} that would change
                      </Button>
                      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                        {applyTargets.length === 0 ? "Nothing to apply. " : ""}
                        {leftOut.compliant > 0 ? `${leftOut.compliant} already compliant. ` : ""}
                        {leftOut.failed > 0 ? `${leftOut.failed} failed or did not answer the dry-run — left out; check them below.` : ""}
                      </Typography>
                    </Stack>
                  )}
                </Box>
              ) : null}

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
