// src/components/Compliance/DeviceDrawerContent.jsx
//
// Device drill-down drawer body, extracted from the SecurityCompliance
// god-component. Fully props-driven: the SCP page owns the drawer open/close,
// the device-detail fetch, and the page-level snackbar, and hands this
// component the data + lifecycle callbacks (onRequestRefetch / onToast). This
// component owns only its per-drawer interaction state — the finding sort
// order, bulk-selection Set, in-flight mutation id, and the status/history
// dialogs. Remounts (and thus resets that state) when the parent keys it by
// the open agentId.

import * as React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import {
  StatusChip,
  ScoreBar,
  Sparkline,
  RemediationStatusChip,
  REMEDIATION_STATUS_META
} from "./complianceChips";
import { ACK_EXPIRY_PRESETS, ackUntilIso } from "./complianceHelpers";
import FindingCard from "./FindingCard";
import StatusChangeDialog from "./StatusChangeDialog";
import FindingHistoryDialog from "./FindingHistoryDialog";
import DeviceDiffSection from "./DeviceDiffSection";
import FleetRankingLine from "./FleetRankingLine";
import BulkFindingToolbar from "./BulkFindingToolbar";
import { useFindingLifecycle } from "./useFindingLifecycle";
import { useBulkSelection } from "./useBulkSelection";
import { PatchLevelSection } from "./PatchLevel";
import { GpoInventorySection } from "./GpoInventory";

export default function DeviceDrawerContent({
  agentId,
  loading,
  /** Set when the detail request failed. Distinct from an empty device. */
  error,
  onRetry,
  data,
  timeseries,
  onClose,
  frameworkLabels,
  onNavigateToAsset,
  // Sprint 3 — lifecycle wiring. Provided by the SCP page so the
  // drawer can trigger a parent-side refetch + snackbar after every
  // successful mutation, and the snackbar/dialog state stays at one
  // level instead of being scattered per-card.
  onRequestRefetch,
  onToast,
  // RBAC — false for USER-role members. Hides the bulk toolbar and
  // every per-finding lifecycle mutation (the backend gates the same
  // endpoints with requireTenantAdmin, so without this the buttons
  // would render and then 403). Defaults to true so existing tests
  // and call sites keep the privileged rendering.
  canManage = true,
  // Fase C — (category) => {mode, capabilities[]} | null. When a failing
  // finding's category maps to an enforceable baseline capability not
  // yet in auto, FindingCard shows the "auto-fix available" hint and
  // onOpenBaselines jumps to the Baselines tab.
  baselineHintForCategory = null,
  onOpenBaselines = null,
  // Sprint 4 — one-click fix (finding) => Promise. Provided by the page,
  // which owns the confirm dialog + POST /remediate + toast.
  onRemediateFinding = null,
  // Sprint 4 — cross.vulnerability.* findings link to PM → Vulnerabilities.
  onOpenVulnerabilities = null
}) {
  const device = data?.device;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- findings is computed conditionally above; suppressing to preserve existing memo behavior.
  const findings = Array.isArray(data?.findings) ? data.findings : [];

  // Group findings by category for scanning. Hooks must run in the
  // same order every render — the early `agentId` return below must
  // therefore stay AFTER the useMemo calls. Putting the return on
  // top (as the original code did) made React see a different hook
  // count when the drawer toggled open/closed, which eslint's
  // rules-of-hooks correctly flagged.
  //
  // Sprint 1 item 3.3 — within each category, sort by severity
  // descending (critical → high → medium → low → info) and then by
  // status (fail before pass/NA) so the cards that need action surface
  // first. Categories with any fail/critical also bubble up to the
  // top of the category list.
  //
  // The previous version kept the order findings came back from the
  // API, which was effectively check-id alphabetical → critical
  // findings could end up scrolled below 20 informational checks in
  // the drawer.
  const SEVERITY_RANK = React.useMemo(
    () => ({ critical: 0, high: 1, medium: 2, low: 3, info: 4 }),
    []
  );
  const STATUS_RANK = React.useMemo(
    () => ({ fail: 0, error: 1, not_applicable: 2, info: 3, pass: 4 }),
    []
  );
  const findingSortKey = React.useCallback(
    (f) => [
      SEVERITY_RANK[f.severity] ?? 99,
      STATUS_RANK[f.status] ?? 99,
      f.checkId || ""
    ],
    [SEVERITY_RANK, STATUS_RANK]
  );

  // ── Sólo lo que falla, por defecto ─────────────────────────────────
  // El panel listaba los ~94 controles evaluados, y en un equipo típico
  // la mayoría pasan o no aplican. Quien lo abre viene a ver qué está
  // mal: enseñarle primero 60 filas verdes convierte la respuesta en una
  // búsqueda. El resto sigue estando, a un clic — no se oculta nada, se
  // ordena la pregunta.
  //
  // Un equipo SIN fallos no debe abrir en vacío: ahí el filtro se relaja
  // solo, porque "no hay nada que arreglar" se dice mejor enseñando los
  // controles que pasan que con una lista vacía.
  const [failuresOnly, setFailuresOnly] = React.useState(true);

  const failingCount = React.useMemo(
    () => findings.filter((f) => f.status === "fail" || f.status === "error").length,
    [findings]
  );
  const showOnlyFailures = failuresOnly && failingCount > 0;

  const visibleFindings = React.useMemo(
    () =>
      showOnlyFailures
        ? findings.filter((f) => f.status === "fail" || f.status === "error")
        : findings,
    [findings, showOnlyFailures]
  );

  const byCategory = React.useMemo(() => {
    const groups = new Map();
    for (const f of visibleFindings) {
      const key = f.category || "other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    // Sort findings WITHIN each category by (severity, status).
    for (const arr of groups.values()) {
      arr.sort((a, b) => {
        const ka = findingSortKey(a);
        const kb = findingSortKey(b);
        for (let i = 0; i < ka.length; i += 1) {
          if (ka[i] < kb[i]) return -1;
          if (ka[i] > kb[i]) return 1;
        }
        return 0;
      });
    }
    // Sort CATEGORIES by their most-severe finding so a category with
    // a critical fail floats above one with only info-level checks.
    return Array.from(groups.entries()).sort(([nameA, arrA], [nameB, arrB]) => {
      const topA = findingSortKey(arrA[0] ?? { severity: "info", status: "pass" });
      const topB = findingSortKey(arrB[0] ?? { severity: "info", status: "pass" });
      for (let i = 0; i < topA.length; i += 1) {
        if (topA[i] < topB[i]) return -1;
        if (topA[i] > topB[i]) return 1;
      }
      return nameA.localeCompare(nameB);
    });
  }, [visibleFindings, findingSortKey]);

  const statusCounts = React.useMemo(() => {
    const c = { pass: 0, fail: 0, not_applicable: 0, info: 0, error: 0 };
    for (const f of findings) {
      const k = f.status && c[f.status] !== undefined ? f.status : "error";
      c[k] += 1;
    }
    return c;
  }, [findings]);

  // ── Sprint 3 lifecycle + Sprint 6 bulk — extracted to hooks (Sprint 2
  // item 6). Behaviour is byte-for-byte what lived inline here; see
  // useFindingLifecycle.js / useBulkSelection.js. The drawer keeps
  // owning only its render + dialog wiring.
  const {
    pendingAction,
    statusDialog,
    setStatusDialog,
    historyDialog,
    setHistoryDialog,
    handleAck,
    handleRevoke,
    handleChangeStatus,
    confirmStatusChange,
  } = useFindingLifecycle({ onToast, onRequestRefetch });

  const {
    selectedIds,
    toggleSelected,
    selectAll,
    clearSelection,
    bulkStatusDialog,
    setBulkStatusDialog,
    bulkMenuAnchor,
    setBulkMenuAnchor,
    bulkPending,
    handleBulkAck,
    handleBulkRevoke,
    handleBulkChangeStatus,
    confirmBulkStatusChange,
    // La selección masiva opera SOBRE LO VISIBLE. Con el filtro de fallos
    // activo, un "select all" sobre la lista completa marcaría hallazgos
    // que el operador no tiene delante — y "acknowledge" sobre algo que
    // no has visto es exactamente lo que un registro de compliance no
    // puede permitirse.
  } = useBulkSelection({ findings: visibleFindings, resetKey: agentId, onToast, onRequestRefetch });

  if (!agentId) return null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header ----------------------------------------------------------- */}
      <Box
        sx={{
          p: 2,
          borderBottom: `1px solid ${BRAND.border}`,
          display: "flex",
          alignItems: "flex-start",
          gap: 1
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h6"
            sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.2 }}
            noWrap
          >
            {device?.hostname || agentId}
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray, display: "block" }}>
            {device?.platform ? `${device.platform} · ` : ""}
            {device?.agentVersion ? `agent ${device.agentVersion} · ` : ""}
            {device?.collectedAtUtc
              ? `last report ${new Date(device.collectedAtUtc).toLocaleString()}`
              : "no report yet"}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseOutlinedIcon />
        </IconButton>
      </Box>

      {loading ? (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <CircularProgress size={24} sx={{ color: BRAND.teal }} />
        </Box>
      ) : error ? (
        // A failed request is NOT an empty device. Collapsing the two used
        // to render "no compliance data for this device yet" whenever the
        // detail call returned 403/500 — a confident, false statement
        // about the endpoint, which sends the operator to investigate a
        // machine that is fine. Say what actually happened, and offer the
        // retry, because the common causes here are transient.
        <Box sx={{ p: 3 }}>
          <Alert
            severity="error"
            action={
              onRetry ? (
                <Button color="inherit" size="small" onClick={onRetry}>
                  Retry
                </Button>
              ) : null
            }
          >
            <AlertTitle>Couldn&apos;t load this device</AlertTitle>
            {error}
          </Alert>
        </Box>
      ) : !device ? (
        <Box sx={{ p: 3 }}>
          <Alert severity="warning">No compliance data for this device yet.</Alert>
        </Box>
      ) : (
        <Box sx={{ overflow: "auto", p: 2, flex: 1 }}>
          {/* Posture snapshot ---------------------------------------------- */}
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid size={6}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid ${BRAND.border}`
                }}
              >
                <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase" }}>
                  Overall status
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <StatusChip status={device.overallStatus || "unknown"} />
                </Box>
                <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 1 }}>
                  {statusCounts.pass} pass · {statusCounts.fail} fail · {statusCounts.not_applicable} N/A · {statusCounts.info} info
                  {statusCounts.error > 0 ? ` · ${statusCounts.error} error` : ""}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={6}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid ${BRAND.border}`
                }}
              >
                <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase" }}>
                  Weighted score
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  {/* Drawer header score — pass null through so the
                      "no data" rendering kicks in for insufficient-
                      data devices instead of showing a fake 0%. */}
                  <ScoreBar value={device.overallScore} />
                </Box>
                {/* Sprint 1/2 — exception-adjusted score, shown only
                    when it diverges from raw: the delta is what the
                    device's accepted exceptions are worth. */}
                {device.overallScoreAdjusted != null &&
                device.overallScore != null &&
                device.overallScoreAdjusted !== device.overallScore ? (
                  <Typography
                    variant="caption"
                    sx={{ color: BRAND.gray, display: "block", mt: 0.25 }}
                  >
                    adjusted for exceptions:{" "}
                    <Box component="span" sx={{ fontWeight: 700, color: BRAND.dark }}>
                      {device.overallScoreAdjusted}%
                    </Box>
                  </Typography>
                ) : null}
                {/* Sprint 7 item 3.6 — fleet ranking. Sits under the
                    score so an operator immediately sees "this is
                    72 — top 27% of fleet" without scrolling. The
                    widget owns its own fetch + states; the parent
                    just hands it the agent id. */}
                <FleetRankingLine agentId={agentId} />
              </Paper>
            </Grid>
          </Grid>

          {/* Per-framework score chips ------------------------------------- */}
          {device.scoresByFramework && Object.keys(device.scoresByFramework).length > 0 ? (
            <Paper
              elevation={0}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px solid ${BRAND.border}`,
                mb: 2
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
              >
                By framework
              </Typography>
              <Grid container spacing={1}>
                {Object.entries(device.scoresByFramework).map(([fw, b]) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={fw}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.dark }} noWrap>
                          {frameworkLabels.get(fw) || fw}
                        </Typography>
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          {b.passed}/{b.applicable} controls passing
                        </Typography>
                      </Box>
                      <ScoreBar value={b.score} />
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          ) : null}

          {/* Trend (last 30 d) -------------------------------------------- */}
          {timeseries?.buckets && timeseries.buckets.length > 1 ? (
            <Paper
              elevation={0}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px solid ${BRAND.border}`,
                mb: 2
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
              >
                Score trend · last {timeseries.windowDays} days
              </Typography>
              <Sparkline points={timeseries.buckets.map((b) => b.score ?? 0)} />
            </Paper>
          ) : null}

          {/* Patch level -------------------------------------------------- */}
          <PatchLevelSection
            patchSummary={device.patchSummary}
            recentPatches={device.recentPatches}
          />

          {/* ADR-0012 — Active Directory GPOs applied to the device/user -- */}
          <GpoInventorySection findings={findings} />

          {/* Sprint 4 — diff vs last scan -------------------------------- */}
          <DeviceDiffSection agentId={agentId} />

          {/* Sprint 6 — bulk action toolbar. Renders only when the
              operator has selected one or more findings. Sticky
              just under the patch section so a long findings list
              keeps it visible while scrolling. Selection persists
              across the categories below — checkboxes per finding
              + this toolbar are the single bulk surface. */}
          {canManage && findings.length > 0 ? (
            <BulkFindingToolbar
              totalCount={visibleFindings.length}
              selectedCount={selectedIds.size}
              onSelectAll={selectAll}
              onClear={clearSelection}
              onOpenMenu={(e) => setBulkMenuAnchor(e.currentTarget)}
              pending={bulkPending}
            />
          ) : null}

          {/* Bulk action menu — same transitions as the per-finding
              menu, plus "Acknowledge / Revoke ack" at the top. */}
          <Menu
            anchorEl={bulkMenuAnchor}
            open={Boolean(bulkMenuAnchor)}
            onClose={() => setBulkMenuAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            {/* Expiring exceptions — acknowledge with an optional
                expiry. Presets keep the menu keyboard-simple; the
                "indefinitely" row preserves the old behaviour. */}
            {ACK_EXPIRY_PRESETS.map((preset) => (
              <MenuItem
                key={preset.label}
                onClick={() => handleBulkAck(ackUntilIso(preset.days))}
              >
                {preset.days == null ? (
                  <VisibilityOutlinedIcon sx={{ fontSize: ICON.md, mr: 1 }} />
                ) : (
                  <ScheduleOutlinedIcon sx={{ fontSize: ICON.md, mr: 1 }} />
                )}
                <Typography variant="body2">
                  Acknowledge selected {preset.label}
                </Typography>
              </MenuItem>
            ))}
            <MenuItem onClick={handleBulkRevoke}>
              <VisibilityOffOutlinedIcon sx={{ fontSize: ICON.md, mr: 1 }} />
              <Typography variant="body2">Revoke acknowledgement</Typography>
            </MenuItem>
            {/* All transitions surfaced. The backend rejects
                invalid ones per-item; the toast summary tells the
                operator how many took. */}
            {["in_progress", "remediated", "risk_accepted", "wont_fix", "open"].map((next) => (
              <MenuItem key={next} onClick={() => handleBulkChangeStatus(next)}>
                <RemediationStatusChip status={next} />
                <Typography variant="body2" sx={{ ml: 1 }}>
                  Mark {REMEDIATION_STATUS_META[next]?.label.toLowerCase()}
                </Typography>
              </MenuItem>
            ))}
          </Menu>

          {/* Qué se está mirando, y cómo ver el resto. Va justo encima de
              la lista para que el filtro y su efecto se lean juntos. */}
          {failingCount > 0 ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                {showOnlyFailures
                  ? `Showing ${failingCount} failing of ${findings.length} evaluated controls`
                  : `Showing all ${findings.length} evaluated controls`}
              </Typography>
              <Button
                size="small"
                onClick={() => setFailuresOnly((v) => !v)}
                sx={{ textTransform: "none", color: BRAND.teal }}
              >
                {showOnlyFailures ? "Show all" : "Show only failures"}
              </Button>
            </Stack>
          ) : null}

          {/* Findings grouped by category --------------------------------- */}
          {byCategory.map(([category, items]) => (
            <Box key={category} sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  color: BRAND.tealText,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  display: "block",
                  mb: 0.75
                }}
              >
                {category.replace(/_/g, " ")}
              </Typography>
              <Stack spacing={1}>
                {items.map((f) => (
                  <FindingCard
                    key={f.id ?? f.checkId}
                    finding={f}
                    onAck={handleAck}
                    onRevoke={handleRevoke}
                    onChangeStatus={handleChangeStatus}
                    onShowHistory={(finding) => setHistoryDialog({ finding })}
                    pendingAction={pendingAction}
                    readOnly={!canManage}
                    baselineHint={baselineHintForCategory ? baselineHintForCategory(f.category) : null}
                    onOpenBaselines={onOpenBaselines}
                    onRemediate={canManage && onRemediateFinding ? onRemediateFinding : null}
                    onOpenVulnerabilities={onOpenVulnerabilities}
                    deviceVulnerability={device?.vulnerability ?? null}
                    canExplain={canManage}
                    // Sprint 6 — bulk selection. Checkbox hidden for
                    // read-only members (selection only feeds bulk
                    // mutations, which they can't run).
                    selected={selectedIds.has(f.id)}
                    onToggleSelected={
                      canManage && f.id ? () => toggleSelected(f.id) : null
                    }
                  />
                ))}
              </Stack>
            </Box>
          ))}

          <Box sx={{ mt: 2, textAlign: "right" }}>
            <Button size="small" onClick={onNavigateToAsset}>
              View device in Assets →
            </Button>
          </Box>
        </Box>
      )}

      {/* Sprint 3 — lifecycle dialogs. Mounted unconditionally so the
          first open is cheap; the components early-return when their
          props say they're closed. */}
      <StatusChangeDialog
        open={Boolean(statusDialog)}
        finding={statusDialog?.finding ?? null}
        targetStatus={statusDialog?.targetStatus ?? null}
        onConfirm={confirmStatusChange}
        onCancel={() => setStatusDialog(null)}
      />
      <FindingHistoryDialog
        open={Boolean(historyDialog)}
        finding={historyDialog?.finding ?? null}
        onClose={() => setHistoryDialog(null)}
      />
      {/* Sprint 6 — bulk status-change confirmation. Reuses
          StatusChangeDialog but passes `finding=null` because the
          dialog body talks about "selected findings" generically;
          the label only needs targetStatus. */}
      <StatusChangeDialog
        open={Boolean(bulkStatusDialog)}
        finding={null}
        targetStatus={bulkStatusDialog?.targetStatus ?? null}
        onConfirm={confirmBulkStatusChange}
        onCancel={() => setBulkStatusDialog(null)}
      />
    </Box>
  );
}
