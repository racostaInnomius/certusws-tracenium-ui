// src/pages/SecurityCompliance.jsx
//
// Real wiring of the Security Compliance module. Replaces the prior
// placeholder screen with four sections driven by the compliance API:
//
//   1. Hero — tenant-wide KPIs (compliant / non-compliant / avg score).
//   2. Framework table — per-framework aggregate (avg score + counts)
//      with a switcher that filters the device table below.
//   3. Device table — one row per device with its score against the
//      currently selected framework. Click → drill-down drawer.
//   4. Device drawer — findings grouped by category, each with the
//      frameworks it maps to (CIS 9.3.1, NIST SC-7(5), CSF PR.IR-01)
//      surfaced as chips + description + remediation.
//
// Design principles:
//   - The verdict comes from a framework, not from Tracenium. Every
//     finding chip shows the framework control ID; hover = full title.
//   - "info" severity never penalizes the score — it shows as a
//     neutral chip in the detail view.
//   - Errors + not_applicable results are surfaced explicitly so the
//     operator can tell "device didn't report" from "device is
//     non-compliant".

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  Grid,
  IconButton,
  MenuItem,
  Select,
  Snackbar,
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
import GppGoodOutlinedIcon from "@mui/icons-material/GppGoodOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
// Sprint 4 — diff + export
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
// Sprint 5 — settings panel trigger
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
// Sprint 6 — PDF export + bulk actions
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";

import {
  getComplianceSummary,
  getFrameworks,
  getFrameworkSummary,
  getDevicePosture,
  getDeviceDetail,
  getDeviceTimeseries,
  // Sprint 4
  downloadFindingsCsv,
  // Sprint 6
  downloadFindingsPdf
} from "../api/compliance";
import { BRAND, ROLE } from "../theme/brand";
import {
  ScoreBar,
  StatusChip,
} from "../components/Compliance/complianceChips";
import { updateSearchParams } from "../utils/browserState";
import { parseUrlFilters, filterDevices } from "./complianceFilters";

import { useAuthContext } from "../auth/AuthContext";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import SharedSummaryCard from "../components/common/SummaryCard";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import DeviceDrawerContent from "../components/Compliance/DeviceDrawerContent";
import { PatchChip, formatRelativeTime } from "../components/Compliance/PatchLevel";
import MttrCard from "../components/Compliance/MttrCard";
import ComplianceSettingsPanel from "../components/Compliance/ComplianceSettingsPanel";
import ComplianceCatalogDialog from "../components/Compliance/ComplianceCatalogDialog";
import ComplianceCategoryBreakdown from "../components/Compliance/ComplianceCategoryBreakdown";
import ComplianceTrendChart from "../components/Compliance/ComplianceTrendChart";
import { useCachedFetch } from "../hooks/useCachedFetch";

// ---------- constants --------------------------------------------------------

// ── Sprint 3 — remediation lifecycle ────────────────────────────────

// Client-side mirror of the backend's transition matrix
// (modules/compliance/finding-lifecycle.service.ts:ALLOWED_TRANSITIONS).
// Used to drive the action menu so the operator only sees valid next
// states. The backend re-validates and returns the canonical
// `allowedTransitions` set on 409, so this is purely for UX
// responsiveness — drift between front and back doesn't break
// anything, it just shows one more option that gets rejected.
// Remediation-lifecycle constants + date/ack helpers moved to
// components/Compliance/complianceHelpers.js (imported at the top).

// Sprint 7 item 3.1 — true if the device was enrolled in the last
// 24h. Used to render the "Recently enrolled" chip; the threshold
// matches the typical "give it one scan cycle" window. The data
// itself comes from `agent.created_at` (exposed via fetchTenantDevicePosture).
const RECENTLY_ENROLLED_THRESHOLD_MS = 24 * 60 * 60 * 1000;
function isRecentlyEnrolled(isoString) {
  if (!isoString) return false;
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return false;
  return Date.now() - then < RECENTLY_ENROLLED_THRESHOLD_MS;
}

// Patch-recency cluster (helpers + PatchChip/PatchRow/PatchLevelSection)
// moved to components/Compliance/PatchLevel.jsx (imported at top).


function navigateTo(page, extraQuery = {}) {
  const params = new URLSearchParams(window.location.search);
  params.set("page", page);
  Object.entries(extraQuery).forEach(([k, v]) => {
    if (v == null) params.delete(k);
    else params.set(k, String(v));
  });
  // Collapse accidental `//` in the pathname so pushState doesn't
  // silently reject the URL as cross-origin (see navigateWithQuery
  // comment in Overview.jsx for the full story).
  const pathname = window.location.pathname.replace(/^\/+/, "/") || "/";
  window.history.pushState({}, "", `${pathname}?${params.toString()}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function readUrlFilters() {
  if (typeof window === "undefined") return {};
  return parseUrlFilters(window.location.search);
}

export default function SecurityCompliance() {
  // RBAC — same convention as SecurityBaselines.jsx: ADMIN/OWNER may
  // mutate (finding lifecycle, bulk ops, settings) and pull evidence
  // exports; USER is read-only. The backend enforces the same split
  // (compliance.routes.ts requireTenantAdmin), so this only decides
  // what to render — never rely on it as the security boundary.
  const { auth } = useAuthContext();
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [selectedFramework, setSelectedFramework] = React.useState(""); // "" = overall

  // Deep-link filters (pre-populated from URL, user can clear via
  // chips). Client-side only — we already have the full device list
  // from the backend, so filtering in-memory is cheap and avoids
  // round-tripping for every chip click.
  const initialFilters = React.useMemo(() => readUrlFilters(), []);
  const [statusFilter, setStatusFilter] = React.useState(initialFilters.status || "");
  const [platformFilter, setPlatformFilter] = React.useState(initialFilters.platform || "");
  const [versionBucketFilter, setVersionBucketFilter] = React.useState(
    initialFilters.versionBucket || ""
  );

  // Keep the URL in sync with the on-page filters so they persist across
  // refresh and are shareable (replaceState — no navigation). Empty values are
  // removed by updateSearchParams; the legacy `severity` param is cleared once
  // the honest `status` filter takes over.
  React.useEffect(() => {
    updateSearchParams({
      status: statusFilter,
      platform: platformFilter,
      versionBucket: versionBucketFilter,
      severity: "",
    });
  }, [statusFilter, platformFilter, versionBucketFilter]);

  const [drawerAgentId, setDrawerAgentId] = React.useState(null);
  const [drawerData, setDrawerData] = React.useState(null);
  const [drawerTimeseries, setDrawerTimeseries] = React.useState(null);
  const [drawerLoading, setDrawerLoading] = React.useState(false);

  // Cache key includes the selected framework so flipping the picker
  // gets its own snapshot — coming back to a previously-loaded
  // framework rehydrates instantly. Empty framework = "All frameworks
  // (weighted)".
  const loader = React.useCallback(async () => {
    const [sum, fw, fws, devs] = await Promise.all([
      getComplianceSummary().catch(() => null),
      getFrameworks().catch(() => null),
      getFrameworkSummary().catch(() => null),
      getDevicePosture(selectedFramework ? { framework: selectedFramework } : {}).catch(() => null),
    ]);
    return {
      summary: sum?.summary ?? null,
      frameworks: Array.isArray(fw?.frameworks) ? fw.frameworks : [],
      frameworkSummary: Array.isArray(fws?.items) ? fws.items : [],
      devices: Array.isArray(devs?.items) ? devs.items : [],
    };
  }, [selectedFramework]);

  const cacheKey = `securityCompliance:${selectedFramework || "all"}`;
  const { data, loading, refreshing, error, refetch } = useCachedFetch(cacheKey, loader);
  const summary = data?.summary ?? null;
  // Stable fallback identities — see AssetsDashboard for the same
  // pattern. Without these, downstream useMemo deps see a fresh `[]`
  // on every render and re-run.
  const frameworks = React.useMemo(() => data?.frameworks ?? [], [data]);
  const frameworkSummary = React.useMemo(() => data?.frameworkSummary ?? [], [data]);
  const devices = React.useMemo(() => data?.devices ?? [], [data]);
  const errorMsg = error ? error?.message || "Failed to load compliance data" : null;

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refetch, "scAutoRefresh");

  const openDrawer = React.useCallback(async (agentId) => {
    setDrawerAgentId(agentId);
    setDrawerLoading(true);
    setDrawerData(null);
    setDrawerTimeseries(null);
    try {
      const [detail, ts] = await Promise.all([
        getDeviceDetail(agentId).catch(() => null),
        getDeviceTimeseries(agentId, 30).catch(() => null)
      ]);
      setDrawerData(detail ?? null);
      setDrawerTimeseries(ts ?? null);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  // Sprint 3 — refetch just the drawer (NOT the device table) after a
  // lifecycle mutation. The device table's overall score is unaffected
  // by ack / remediation-status changes (those don't touch the score),
  // so a full page refetch is wasteful. We only re-hit getDeviceDetail
  // to refresh the findings list + their ack/status fields.
  const refetchDrawer = React.useCallback(async () => {
    if (!drawerAgentId) return;
    try {
      const detail = await getDeviceDetail(drawerAgentId).catch(() => null);
      setDrawerData(detail ?? null);
    } catch {
      // Silent — the next user action will retry. We don't want to
      // surface a refetch failure as an error because the underlying
      // mutation already succeeded; the dashboard is just stale.
    }
  }, [drawerAgentId]);

  const closeDrawer = () => {
    setDrawerAgentId(null);
    setDrawerData(null);
    setDrawerTimeseries(null);
  };

  // Sprint 3 — page-level Snackbar surface for lifecycle mutations.
  // Single state object instead of separate severity/message states so
  // an open-then-open in quick succession atomically replaces both.
  const [toast, setToast] = React.useState(null);
  const showToast = React.useCallback((t) => setToast(t), []);
  const hideToast = React.useCallback(() => setToast(null), []);

  // Sprint 4/6 — CSV/PDF export. Downloads go through httpGetBlob (see
  // api/compliance.js) rather than a plain `<a href>` so an MSP operator's
  // X-Tenant-Id override actually reaches the backend; failures surface
  // through the same toast as the rest of the page instead of navigating
  // the tab to a raw error response.
  const [exportingCsv, setExportingCsv] = React.useState(false);
  const [exportingPdf, setExportingPdf] = React.useState(false);

  const handleExportCsv = React.useCallback(async () => {
    setExportingCsv(true);
    try {
      await downloadFindingsCsv({ framework: selectedFramework || undefined });
    } catch (err) {
      showToast({ severity: "error", message: err?.message || "Could not export CSV." });
    } finally {
      setExportingCsv(false);
    }
  }, [selectedFramework, showToast]);

  const handleExportPdf = React.useCallback(async () => {
    setExportingPdf(true);
    try {
      await downloadFindingsPdf({ framework: selectedFramework || undefined });
    } catch (err) {
      showToast({ severity: "error", message: err?.message || "Could not export PDF." });
    } finally {
      setExportingPdf(false);
    }
  }, [selectedFramework, showToast]);

  // Sprint 5 — settings panel open/close. Boolean state; the panel
  // component owns the form state internally.
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [catalogOpen, setCatalogOpen] = React.useState(false);

  // Framework picker label lookup.
  const frameworkLabels = React.useMemo(() => {
    const map = new Map();
    for (const f of frameworks) map.set(f.framework, f.shortName || f.framework);
    return map;
  }, [frameworks]);

  const selectedFrameworkLabel = selectedFramework
    ? frameworkLabels.get(selectedFramework) || selectedFramework
    : "All frameworks (weighted)";

  // Client-side filtering of the device table. We already have the full device
  // list from the backend, so filtering in-memory is cheap. Logic lives in the
  // pure, unit-tested filterDevices helper (complianceFilters.js).
  const filteredDevices = React.useMemo(
    () =>
      filterDevices(devices, {
        status: statusFilter,
        platform: platformFilter,
        versionBucket: versionBucketFilter,
      }),
    [devices, platformFilter, statusFilter, versionBucketFilter]
  );

  return (
    <Box sx={{ pb: 6 }}>
      {/* Page header ------------------------------------------------------- */}
      <PageHeader
        title="Security Compliance"
        subtitle={
          <>
            Verdict is derived from published benchmarks (CIS) and standards (NIST SP 800-53, NIST CSF).
            <br />
            Tracenium maps the agent&apos;s evidence to the control IDs on each finding.
          </>
        }
        icon={<GppGoodOutlinedIcon />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {/* Sprint 5 — tenant compliance settings dialog opener.
                Compact icon button rather than a full "Settings"
                label because the header is already crowded with
                framework picker + export + refresh. */}
            {/* Checks-catalog browser — surfaces the global control catalog
                (what Tracenium evaluates) filtered by platform / category /
                severity / framework. Compact icon button like Settings. */}
            <Tooltip title="Browse the checks catalog" arrow placement="bottom">
              <IconButton
                aria-label="Open compliance catalog"
                size="small"
                onClick={() => setCatalogOpen(true)}
                sx={{
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 1
                }}
              >
                <MenuBookOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            {canManage ? (
              <Tooltip title="Compliance settings" arrow placement="bottom">
                <IconButton
                  aria-label="Compliance settings"
                  size="small"
                  onClick={() => setSettingsOpen(true)}
                  sx={{
                    border: `1px solid ${BRAND.border}`,
                    borderRadius: 1
                  }}
                >
                  <SettingsOutlinedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            ) : null}
            {/* Sprint 4 — CSV export. Fetched as an authenticated blob
                (see handleExportCsv) rather than a plain anchor href, so
                the X-Tenant-Id header for MSP-drilled sessions actually
                reaches the backend. Filter is the currently selected
                framework so the operator can "save what they're looking
                at" without a separate export dialog. */}
            {/* Exports are admin-gated (requireTenantAdmin on the
                backend) — they hand the full evidence set to whoever
                clicks, so USER-role members don't get the buttons. */}
            {canManage ? (
            <Tooltip
              title={
                selectedFramework
                  ? `Export findings for ${selectedFrameworkLabel} as CSV`
                  : "Export all findings as CSV (every mapped framework)"
              }
              arrow
              placement="bottom"
            >
              <span>
                <Button
                  onClick={handleExportCsv}
                  disabled={exportingCsv}
                  size="small"
                  variant="outlined"
                  startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
                  sx={{ textTransform: "none" }}
                >
                  {exportingCsv ? "Exporting…" : "Export CSV"}
                </Button>
              </span>
            </Tooltip>
            ) : null}
            {/* Sprint 6 — PDF export. Same authenticated-blob pattern as
                CSV; pdfkit emits Content-Disposition so the filename
                still comes from the backend. */}
            {canManage ? (
            <Tooltip
              title={
                selectedFramework
                  ? `Export findings for ${selectedFrameworkLabel} as PDF`
                  : "Export all findings as PDF"
              }
              arrow
              placement="bottom"
            >
              <span>
                <Button
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  size="small"
                  variant="outlined"
                  startIcon={<PictureAsPdfOutlinedIcon sx={{ fontSize: 16 }} />}
                  sx={{ textTransform: "none" }}
                >
                  {exportingPdf ? "Exporting…" : "Export PDF"}
                </Button>
              </span>
            </Tooltip>
            ) : null}
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={refetch}
              loading={loading || refreshing}
            />
          </Stack>
        }
      />

      {errorMsg ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMsg}
        </Alert>
      ) : null}

      {/* Hero KPIs — homologated with Overview's Hero. The "Compliance"
          and "Critical findings" cards mirror Overview/HeroKpis exactly
          (same labels, icons, score/severity color buckets) so a user
          jumping between the two surfaces reads them as one signal.
          "Devices reporting" + "Compliant" stay because they're
          framework-specific — they don't appear on Overview but make
          sense as drill-down context here. */}
      {(() => {
        const avgScore = summary?.avgScore;
        const complianceAccent =
          avgScore == null
            ? BRAND.teal
            : avgScore >= 85
            ? ROLE.positive
            : avgScore >= 60
            ? ROLE.caution
            : ROLE.critical;
        const complianceTint =
          avgScore == null
            ? BRAND.tealSoft
            : avgScore >= 85
            ? ROLE.positiveSoft
            : avgScore >= 60
            ? ROLE.cautionSoft
            : ROLE.criticalSoft;
        const criticalHigh =
          (summary?.openFindings?.critical ?? 0) +
          (summary?.openFindings?.high ?? 0);
        const findingsAccent = criticalHigh > 0 ? ROLE.critical : ROLE.positive;
        const findingsTint = criticalHigh > 0 ? ROLE.criticalSoft : ROLE.positiveSoft;
        return (
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SharedSummaryCard
                title="Devices reporting"
                value={summary?.devicesReporting ?? "—"}
                icon={<DevicesOutlinedIcon fontSize="small" />}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SharedSummaryCard
                title="Compliance"
                value={avgScore != null ? `${Math.round(avgScore)}%` : "—"}
                icon={<ShieldOutlinedIcon fontSize="small" />}
                accent={complianceAccent}
                tint={complianceTint}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SharedSummaryCard
                title="Compliant"
                value={summary?.statusBreakdown?.compliant ?? 0}
                icon={<VerifiedOutlinedIcon fontSize="small" />}
                accent={ROLE.positive}
                tint={ROLE.positiveSoft}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SharedSummaryCard
                title="Critical findings"
                value={criticalHigh}
                icon={<ReportProblemOutlinedIcon fontSize="small" />}
                accent={findingsAccent}
                tint={findingsTint}
              />
            </Grid>
          </Grid>
        );
      })()}

      {/* Fleet compliance trend over time — the audit / CIO "are we improving?"
          view. Backed by the fleet-timeseries endpoint. */}
      <ComplianceTrendChart notify={(severity, message) => showToast({ severity, message })} />

      {/* Framework switcher + per-framework summary ------------------------ */}
      <SectionPaper variant="panel" sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          gap={1.5}
          sx={{ mb: 1.5 }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
              Posture by framework
            </Typography>
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              Scoring uses the severity weights defined by each framework. Switch to filter the device table below.
            </Typography>
          </Box>
          <Select
            value={selectedFramework}
            onChange={(e) => setSelectedFramework(e.target.value)}
            size="small"
            displayEmpty
            sx={{ minWidth: 260 }}
          >
            <MenuItem value="">All frameworks (weighted)</MenuItem>
            {frameworks.map((f) => (
              <MenuItem key={f.framework} value={f.framework}>
                {f.shortName || f.framework}
              </MenuItem>
            ))}
          </Select>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Framework</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Devices reporting</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Compliant</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Non-compliant</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Avg score</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Pass / Applicable</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {frameworkSummary.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: BRAND.gray, py: 3 }}>
                    No devices have reported compliance yet.
                  </TableCell>
                </TableRow>
              ) : (
                frameworkSummary.map((f) => (
                  <TableRow
                    key={f.framework}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => setSelectedFramework(f.framework)}
                    selected={f.framework === selectedFramework}
                  >
                    <TableCell>
                      <Stack>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.dark }}>
                          {frameworkLabels.get(f.framework) || f.framework}
                        </Typography>
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          {f.framework}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{f.devicesReporting}</TableCell>
                    <TableCell align="right" sx={{ color: ROLE.positive, fontWeight: 600 }}>
                      {f.devicesCompliant}
                    </TableCell>
                    <TableCell align="right" sx={{ color: ROLE.critical, fontWeight: 600 }}>
                      {f.devicesNonCompliant}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: "inline-block" }}>
                        <ScoreBar value={f.avgScore} />
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ color: BRAND.dark }}>
                      {f.totalPassed} / {f.totalApplicable}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionPaper>

      {/* Fleet posture by control category (firewall, crypto, patching, …) —
          the fleet analogue of the drawer's per-device category grouping.
          Sits below the framework table (compliance vs benchmarks) and above
          the MTTR/device views (triage). */}
      <ComplianceCategoryBreakdown />

      {/* Sprint 5 — fleet time-to-close by severity. Mounted between
          the framework table (top-down "how does the fleet compare to
          benchmarks") and the device table (drill-down) so an
          operator's eye lands on it BEFORE they scroll into per-
          device triage. */}
      <MttrCard />

      {/* Device table ------------------------------------------------------ */}
      <SectionPaper variant="panel" sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
              Devices
            </Typography>
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              Filtered by <strong>{selectedFrameworkLabel}</strong>. Click a row for findings.
            </Typography>
          </Box>
          {loading ? <CircularProgress size={18} sx={{ color: BRAND.teal }} /> : null}
        </Stack>

        {/* On-page filter toolbar. Sets the same client-side filters that used
            to be deep-link-only; changes sync back to the URL so they persist
            on refresh + are shareable. "All" clears a filter. */}
        <Stack
          direction="row"
          spacing={1}
          sx={{ mb: 1.5, flexWrap: "wrap", gap: 1, alignItems: "center" }}
        >
          <FilterAltOutlinedIcon sx={{ fontSize: 18, color: BRAND.gray }} />
          <TextField
            select size="small" label="Status" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="fail">Failing</MenuItem>
            <MenuItem value="pass">Compliant</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Platform" value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All platforms</MenuItem>
            <MenuItem value="windows">Windows</MenuItem>
            <MenuItem value="macos">macOS</MenuItem>
            <MenuItem value="linux">Linux</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Agent version" value={versionBucketFilter}
            onChange={(e) => setVersionBucketFilter(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All versions</MenuItem>
            <MenuItem value="current">Current</MenuItem>
            <MenuItem value="one_behind">One behind</MenuItem>
            <MenuItem value="older">Older</MenuItem>
            <MenuItem value="unknown">Unknown</MenuItem>
          </TextField>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 600 }}>
            {filteredDevices.length} of {devices.length} devices
          </Typography>
          {statusFilter || platformFilter || versionBucketFilter ? (
            <Button
              size="small"
              onClick={() => {
                setStatusFilter("");
                setPlatformFilter("");
                setVersionBucketFilter("");
              }}
              sx={{ textTransform: "none", color: BRAND.gray }}
            >
              Clear
            </Button>
          ) : null}
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              {/* Pass / Applicable only carries meaningful data when a
                  framework filter is active — frameworkScore.passed and
                  .applicable are only populated under that scope. With
                  no framework selected the column rendered "—" for every
                  row and was just visual noise. We hide it entirely in
                  that case so the table stays focused on the columns
                  that actually have signal. */}
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Host</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Platform</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Agent</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Score</TableCell>
                {selectedFramework ? (
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Pass / Applicable</TableCell>
                ) : null}
                {/* Patch-level chip: count + days-since-latest, color coded.
                    Intentionally sits between pass/applicable and last report
                    so operators can scan "how many passing checks vs how
                    patched" side-by-side. */}
                <TableCell align="right" sx={{ fontWeight: 700 }}>Patches</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last report</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDevices.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={selectedFramework ? 8 : 7} align="center" sx={{ color: BRAND.gray, py: 3 }}>
                    {devices.length === 0
                      ? "No devices have reported compliance under this framework."
                      : "No devices match the applied filters. Clear chips above to see all."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredDevices.map((d) => {
                  const useFw = Boolean(selectedFramework && d.frameworkScore);
                  const score = useFw ? d.frameworkScore.score : d.overallScore;
                  const passed = useFw ? d.frameworkScore.passed : null;
                  const applicable = useFw ? d.frameworkScore.applicable : null;
                  return (
                    <TableRow
                      key={d.agentId}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => openDrawer(d.agentId)}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
                          {d.hostname || d.agentId}
                        </Typography>
                        {d.hostname ? (
                          <Typography variant="caption" sx={{ color: BRAND.gray, display: "block" }}>
                            {d.agentId}
                          </Typography>
                        ) : null}
                        {/* Sprint 7 item 3.1 (real detector) — chip
                            shown when the device was enrolled within
                            the last 24h. Distinct from
                            "insufficient_data" which can also fire
                            for long-standing devices with broken
                            collectors. We don't gate the chip on
                            status === insufficient_data because a
                            freshly-enrolled device that DOES manage
                            to score quickly should still get the
                            "new" indicator briefly. */}
                        {isRecentlyEnrolled(d.agentCreatedAtUtc) ? (
                          <Chip
                            label="Recently enrolled"
                            size="small"
                            sx={{
                              mt: 0.25,
                              bgcolor: BRAND.tealSoft,
                              color: BRAND.tealText,
                              fontWeight: 700,
                              height: 20,
                              fontSize: 10,
                              fontStyle: "italic"
                            }}
                          />
                        ) : d.overallStatus === "insufficient_data" ? (
                          // Older device with insufficient data is a
                          // different concern — collector is sending
                          // incomplete evidence. We still show a hint
                          // but the wording shifts blame off the
                          // operator ("wait it out") and toward the
                          // collector ("look into this").
                          <Typography
                            variant="caption"
                            sx={{
                              color: BRAND.gray,
                              fontStyle: "italic",
                              display: "block",
                              mt: 0.25
                            }}
                          >
                            Insufficient evidence — check collector
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell sx={{ textTransform: "capitalize" }}>
                        {d.platform || "—"}
                      </TableCell>
                      <TableCell>{d.agentVersion || "—"}</TableCell>
                      <TableCell>
                        <StatusChip status={d.overallStatus || "unknown"} />
                      </TableCell>
                      <TableCell align="right">
                        {/* Pass `score` through unchanged — null is now a
                            meaningful "insufficient_data" signal that
                            ScoreBar renders as "—" with neutral gray.
                            The previous `score ?? 0` coerced null → 0
                            and painted a full red bar for devices that
                            had simply not reported a scorable posture,
                            making them look catastrophically broken. */}
                        <ScoreBar value={score} />
                      </TableCell>
                      {selectedFramework ? (
                        <TableCell align="right">
                          {useFw ? `${passed} / ${applicable}` : "—"}
                        </TableCell>
                      ) : null}
                      <TableCell align="right">
                        <PatchChip patchSummary={d.patchSummary} />
                      </TableCell>
                      <TableCell>
                        {/* Sprint 1 item 3.2 — relative time is more
                            scannable than the full locale-formatted
                            timestamp. We keep the full timestamp in a
                            tooltip so an auditor who wants the exact
                            time can still get it. */}
                        {d.collectedAtUtc ? (
                          <Tooltip
                            title={new Date(d.collectedAtUtc).toLocaleString()}
                            arrow
                            placement="top"
                          >
                            <Typography variant="body2" sx={{ color: BRAND.dark }}>
                              {formatRelativeTime(d.collectedAtUtc) ?? "—"}
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" sx={{ color: BRAND.gray }}>
                            —
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionPaper>

      {/* Drawer: device drill-down ---------------------------------------- */}
      <Drawer
        anchor="right"
        open={Boolean(drawerAgentId)}
        onClose={closeDrawer}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 560, md: 640 },
            maxWidth: "100%"
          }
        }}
      >
        <DeviceDrawerContent
          agentId={drawerAgentId}
          loading={drawerLoading}
          data={drawerData}
          timeseries={drawerTimeseries}
          onClose={closeDrawer}
          frameworkLabels={frameworkLabels}
          onNavigateToAsset={() => {
            closeDrawer();
            navigateTo("assets", { agentId: drawerAgentId });
          }}
          // Sprint 3 — lifecycle wiring
          onRequestRefetch={refetchDrawer}
          onToast={showToast}
          canManage={canManage}
        />
      </Drawer>

      {/* Sprint 3 — page-level Snackbar for finding lifecycle
          actions (ack, revoke, status change). Auto-dismisses after
          4 s on success, 6 s on warning/error so the operator has
          time to read the structured backend message
          (INVALID_TRANSITION etc.). */}
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={toast?.severity === "success" ? 4000 : 6000}
        onClose={hideToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {toast ? (
          <Alert
            onClose={hideToast}
            severity={toast.severity}
            variant="filled"
            sx={{ minWidth: 320 }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>

      {/* Sprint 5 — tenant compliance settings dialog. Triggered
          from the header icon. Posts to PUT /settings; uses the
          same showToast surface as the lifecycle actions. */}
      <ComplianceSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onToast={showToast}
      />

      {/* Read-only browser over the global control catalog. */}
      <ComplianceCatalogDialog open={catalogOpen} onClose={() => setCatalogOpen(false)} />
    </Box>
  );
}

