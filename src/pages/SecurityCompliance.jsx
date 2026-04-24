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
  Collapse,
  Drawer,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import LaunchOutlinedIcon from "@mui/icons-material/LaunchOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";

import {
  getComplianceSummary,
  getFrameworks,
  getFrameworkSummary,
  getDevicePosture,
  getDeviceDetail,
  getDeviceTimeseries
} from "../api/compliance";
import { BRAND, ROLE } from "../theme/brand";

// ---------- constants --------------------------------------------------------

const STATUS_META = {
  pass: {
    label: "Pass",
    icon: <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />,
    fg: ROLE.positive,
    bg: ROLE.positiveSoft
  },
  fail: {
    label: "Fail",
    icon: <ErrorOutlineOutlinedIcon sx={{ fontSize: 14 }} />,
    fg: ROLE.critical,
    bg: ROLE.criticalSoft
  },
  not_applicable: {
    label: "N/A",
    icon: <BlockOutlinedIcon sx={{ fontSize: 14 }} />,
    fg: BRAND.gray,
    bg: BRAND.surfaceMuted
  },
  info: {
    label: "Info",
    icon: <InfoOutlinedIcon sx={{ fontSize: 14 }} />,
    fg: BRAND.teal,
    bg: BRAND.tealSoft
  },
  error: {
    label: "Error",
    icon: <HelpOutlineOutlinedIcon sx={{ fontSize: 14 }} />,
    fg: ROLE.caution,
    bg: ROLE.cautionSoft
  },
  unknown: {
    label: "Unknown",
    icon: <HelpOutlineOutlinedIcon sx={{ fontSize: 14 }} />,
    fg: BRAND.gray,
    bg: BRAND.surfaceMuted
  }
};

const SEVERITY_META = {
  critical: { fg: ROLE.critical, bg: ROLE.criticalSoft, label: "Critical" },
  high:     { fg: ROLE.caution,  bg: ROLE.cautionSoft,  label: "High" },
  medium:   { fg: BRAND.tealText, bg: BRAND.tealSoft,   label: "Medium" },
  low:      { fg: BRAND.gray,    bg: BRAND.surfaceMuted, label: "Low" },
  info:     { fg: BRAND.teal,    bg: BRAND.tealSoft,    label: "Info" }
};

// ---------- small presentational atoms ---------------------------------------

function SummaryCard({ title, value, hint, accent = BRAND.teal, tint = BRAND.tealSoft }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%"
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: BRAND.dark,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="h4"
        sx={{ color: accent, fontWeight: 700, mt: 0.5, lineHeight: 1.1 }}
      >
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 0.5 }}>
          {hint}
        </Typography>
      ) : null}
      <Box
        aria-hidden
        sx={{
          mt: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: tint
        }}
      />
    </Paper>
  );
}

function StatusChip({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  return (
    <Chip
      label={meta.label}
      size="small"
      icon={meta.icon}
      sx={{
        bgcolor: meta.bg,
        color: meta.fg,
        fontWeight: 700,
        border: `1px solid ${meta.fg}44`,
        "& .MuiChip-icon": { color: meta.fg }
      }}
    />
  );
}

function SeverityChip({ severity }) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.medium;
  return (
    <Chip
      label={meta.label}
      size="small"
      sx={{
        bgcolor: meta.bg,
        color: meta.fg,
        fontWeight: 700,
        border: `1px solid ${meta.fg}44`
      }}
    />
  );
}

function FrameworkChip({ framework, controlId, controlLevel, controlTitle, referenceUrl }) {
  // Short label: "CIS 9.3.1 · L1" / "NIST SC-7(5)" / "CSF PR.IR-01".
  // Tooltip carries the full control title if the catalog mapping has one.
  const fam = framework.startsWith("cis_")
    ? "CIS"
    : framework.startsWith("nist_csf")
    ? "CSF"
    : framework.startsWith("nist_800_53")
    ? "NIST"
    : framework;

  const label =
    controlLevel && fam === "CIS"
      ? `${fam} ${controlId} · ${controlLevel}`
      : `${fam} ${controlId}`;

  const inner = (
    <Chip
      label={label}
      size="small"
      icon={referenceUrl ? <LaunchOutlinedIcon sx={{ fontSize: 12 }} /> : undefined}
      onClick={
        referenceUrl
          ? () => window.open(referenceUrl, "_blank", "noopener,noreferrer")
          : undefined
      }
      clickable={Boolean(referenceUrl)}
      sx={{
        bgcolor: BRAND.darkSoft,
        color: BRAND.dark,
        fontWeight: 600,
        fontSize: 11,
        height: 22,
        border: `1px solid ${BRAND.border}`,
        "& .MuiChip-icon": { color: BRAND.dark, marginLeft: "6px" }
      }}
    />
  );

  if (!controlTitle) return inner;
  return (
    <Tooltip title={controlTitle} arrow placement="top">
      <span>{inner}</span>
    </Tooltip>
  );
}

function ScoreBar({ value, labelSuffix = "%" }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const color = pct >= 85 ? ROLE.positive : pct >= 60 ? ROLE.caution : ROLE.critical;
  return (
    <Box sx={{ minWidth: 110 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, color }}>
          {pct}
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray }}>
          {labelSuffix}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          mt: 0.25,
          height: 6,
          borderRadius: 3,
          bgcolor: BRAND.surfaceMuted,
          "& .MuiLinearProgress-bar": { backgroundColor: color }
        }}
      />
    </Box>
  );
}

// ---------- patch-level presentation helpers ---------------------------------

// Relative-time formatter tuned for "days since last patch". We avoid
// importing a dep (date-fns / dayjs) for this single use and collapse
// everything to coarse buckets (now / Xm / Xh / Xd / Xmo / Xy) so the
// device table cell stays short and readable.
function formatRelativeTime(isoString) {
  if (!isoString) return null;
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return null;
  const deltaMs = Date.now() - then;
  if (deltaMs < 0) return "future";
  const mins = Math.round(deltaMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

function daysSince(isoString) {
  if (!isoString) return null;
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

// Red/amber/green bucket based on days since the device's most recent
// security patch. Thresholds match the agreed SLA (≤30d green, ≤90d
// amber, >90d or unknown red). Centralized so the table cell and the
// drawer mini-card both agree on a single source of truth.
function patchRecencyRole(lastInstalledAtUtc) {
  const days = daysSince(lastInstalledAtUtc);
  if (days == null) return { role: "critical", label: "unknown" };
  if (days <= 30) return { role: "positive", label: `${days}d ago` };
  if (days <= 90) return { role: "caution", label: `${days}d ago` };
  return { role: "critical", label: `${days}d ago` };
}

// Table-cell chip that shows {installed count} + {relative time of last
// patch}, color-coded. Compact enough for a narrow table column.
function PatchChip({ patchSummary }) {
  if (!patchSummary || (patchSummary.count == null && !patchSummary.lastInstalledAtUtc)) {
    return (
      <Typography variant="body2" sx={{ color: BRAND.gray }}>
        —
      </Typography>
    );
  }

  const { role, label } = patchRecencyRole(patchSummary.lastInstalledAtUtc);
  const color =
    role === "positive" ? ROLE.positive : role === "caution" ? ROLE.caution : ROLE.critical;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
        {patchSummary.count != null ? patchSummary.count : "—"}
      </Typography>
      <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
        {label}
      </Typography>
    </Box>
  );
}

// ---------- main page --------------------------------------------------------

function navigateTo(page, extraQuery = {}) {
  const params = new URLSearchParams(window.location.search);
  params.set("page", page);
  Object.entries(extraQuery).forEach(([k, v]) => {
    if (v == null) params.delete(k);
    else params.set(k, String(v));
  });
  window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Acceptable enum values for the deep-link filter params. Anything
// else on the URL is ignored — we don't trust the query string to set
// page state beyond what we explicitly support.
const ALLOWED_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);
const ALLOWED_PLATFORMS = new Set(["windows", "macos", "linux"]);
const ALLOWED_VERSION_BUCKETS = new Set(["current", "one_behind", "older", "unknown"]);

// Semver-ish comparison. Returns > 0 if b > a, matching the shape
// JS sort expects when you want descending order (a.sort(cmp) → highest
// first). Only used for the client-side "pick canonical latest" step in
// the versionBucket filter, so tolerant of weird strings (non-numeric
// segments become 0).
function compareVersionsReverse(a, b) {
  const parse = (v) =>
    String(v || "")
      .split(".")
      .map((x) => Number(x) || 0);
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < Math.max(av.length, bv.length); i += 1) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai !== bi) return bi - ai;
  }
  return 0;
}

// Map a device's agentVersion to one of the buckets the Overview
// donut uses. Mirrors FleetComposition's classifyAgentVersions, but
// kept local here because this page isn't a dependent of that
// component and we don't want to pull it in just for one helper.
function bucketOfVersion(version, canonicalLatest) {
  if (!version || !canonicalLatest) return "unknown";
  const cmp = compareVersionsReverse(version, canonicalLatest);
  // Convention matches classifyAgentVersions:
  //   cmp < 0 → device > canonical (newer than any known latest) — treat as current
  //   cmp === 0 → equal → current
  //   cmp > 0 → device < canonical
  if (cmp <= 0) return "current";
  // One behind: same major.minor, patch within 2.
  const v = String(version).split(".").map((x) => Number(x) || 0);
  const l = String(canonicalLatest).split(".").map((x) => Number(x) || 0);
  if (v[0] === l[0] && v[1] === l[1] && Math.abs((l[2] || 0) - (v[2] || 0)) <= 2) {
    return "one_behind";
  }
  return "older";
}

function readUrlFilters() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const severity = (params.get("severity") || "").toLowerCase();
  const platform = (params.get("platform") || "").toLowerCase();
  const versionBucket = (params.get("versionBucket") || "").toLowerCase();
  return {
    severity: ALLOWED_SEVERITIES.has(severity) ? severity : "",
    platform: ALLOWED_PLATFORMS.has(platform) ? platform : "",
    versionBucket: ALLOWED_VERSION_BUCKETS.has(versionBucket) ? versionBucket : ""
  };
}

export default function SecurityCompliance() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const [summary, setSummary] = React.useState(null);
  const [frameworks, setFrameworks] = React.useState([]);
  const [frameworkSummary, setFrameworkSummary] = React.useState([]);
  const [devices, setDevices] = React.useState([]);
  const [selectedFramework, setSelectedFramework] = React.useState(""); // "" = overall

  // Deep-link filters (pre-populated from URL, user can clear via
  // chips). Client-side only — we already have the full device list
  // from the backend, so filtering in-memory is cheap and avoids
  // round-tripping for every chip click.
  const initialFilters = React.useMemo(() => readUrlFilters(), []);
  const [severityFilter, setSeverityFilter] = React.useState(initialFilters.severity || "");
  const [platformFilter, setPlatformFilter] = React.useState(initialFilters.platform || "");
  const [versionBucketFilter, setVersionBucketFilter] = React.useState(
    initialFilters.versionBucket || ""
  );

  const [drawerAgentId, setDrawerAgentId] = React.useState(null);
  const [drawerData, setDrawerData] = React.useState(null);
  const [drawerTimeseries, setDrawerTimeseries] = React.useState(null);
  const [drawerLoading, setDrawerLoading] = React.useState(false);

  const loadAll = React.useCallback(async (framework) => {
    setLoading(true);
    setError(null);
    try {
      // Fan out in parallel — each endpoint is independent.
      const [sum, fw, fws, devs] = await Promise.all([
        getComplianceSummary().catch(() => null),
        getFrameworks().catch(() => null),
        getFrameworkSummary().catch(() => null),
        getDevicePosture(framework ? { framework } : {}).catch(() => null)
      ]);

      setSummary(sum?.summary ?? null);
      setFrameworks(Array.isArray(fw?.frameworks) ? fw.frameworks : []);
      setFrameworkSummary(Array.isArray(fws?.items) ? fws.items : []);
      setDevices(Array.isArray(devs?.items) ? devs.items : []);
    } catch (err) {
      setError(err?.message || "Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll(selectedFramework);
  }, [loadAll, selectedFramework]);

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

  const closeDrawer = () => {
    setDrawerAgentId(null);
    setDrawerData(null);
    setDrawerTimeseries(null);
  };

  // Framework picker label lookup.
  const frameworkLabels = React.useMemo(() => {
    const map = new Map();
    for (const f of frameworks) map.set(f.framework, f.shortName || f.framework);
    return map;
  }, [frameworks]);

  const selectedFrameworkLabel = selectedFramework
    ? frameworkLabels.get(selectedFramework) || selectedFramework
    : "All frameworks (weighted)";

  // Client-side filtering of the device table based on the deep-link
  // chips. We already have the full device list from the backend, so
  // filtering in-memory is cheap and lets the chips clear instantly
  // without re-fetching.
  //
  // Severity filter is a PROXY today: the posture endpoint doesn't
  // expose per-device severity counts, so "severity >= high" resolves
  // to `overallStatus === 'fail'` (strongly correlated with having at
  // least one failing finding at high+ severity). Swap to a real
  // severity-per-device signal when the backend exposes one.
  const filteredDevices = React.useMemo(() => {
    return devices.filter((d) => {
      if (platformFilter && String(d.platform || "").toLowerCase() !== platformFilter) {
        return false;
      }
      if (severityFilter) {
        // Only two states matter for this proxy: "fail" passes, anything
        // else is hidden. Future: expose per-device severity buckets.
        if (String(d.overallStatus || "").toLowerCase() !== "fail") return false;
      }
      if (versionBucketFilter) {
        // Map the device's agentVersion into the same buckets the
        // FleetComposition donut uses. We don't have canonicalLatest
        // from the /binaries endpoint here, so we bucket relative to
        // the highest version currently reporting — acceptable for a
        // client-side filter, matches what the operator just clicked
        // from the Overview donut.
        const versions = devices
          .map((x) => x.agentVersion)
          .filter(Boolean);
        const canonicalLatest = versions.sort(compareVersionsReverse)[0];
        const bucket = bucketOfVersion(d.agentVersion, canonicalLatest);
        if (bucket !== versionBucketFilter) return false;
      }
      return true;
    });
  }, [devices, platformFilter, severityFilter, versionBucketFilter]);

  return (
    <Box sx={{ pb: 6 }}>
      {/* Page header ------------------------------------------------------- */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            Security Compliance
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Verdict is derived from published benchmarks (CIS) and standards (NIST SP 800-53, NIST CSF). Tracenium maps the agent's evidence to the control IDs on each finding.
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <span>
            <IconButton
              onClick={() => loadAll(selectedFramework)}
              disabled={loading}
              size="small"
              sx={{
                color: BRAND.teal,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 1.5,
                "&:hover": { backgroundColor: BRAND.tealSoft }
              }}
            >
              <RefreshOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {/* Hero KPIs --------------------------------------------------------- */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Devices reporting"
            value={summary?.devicesReporting ?? "—"}
            hint="SCP snapshots received"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Avg score"
            value={summary?.avgScore != null ? `${Math.round(summary.avgScore)}%` : "—"}
            hint="severity-weighted"
            accent={
              summary?.avgScore == null
                ? BRAND.gray
                : summary.avgScore >= 85
                ? ROLE.positive
                : summary.avgScore >= 60
                ? ROLE.caution
                : ROLE.critical
            }
            tint={
              summary?.avgScore == null
                ? BRAND.surfaceMuted
                : summary.avgScore >= 85
                ? ROLE.positiveSoft
                : summary.avgScore >= 60
                ? ROLE.cautionSoft
                : ROLE.criticalSoft
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Compliant"
            value={summary?.statusBreakdown?.compliant ?? 0}
            hint={`${summary?.statusBreakdown?.non_compliant ?? 0} non-compliant · ${summary?.statusBreakdown?.unknown ?? 0} unknown`}
            accent={ROLE.positive}
            tint={ROLE.positiveSoft}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Open findings"
            value={summary?.openFindings?.total ?? 0}
            hint={`${summary?.openFindings?.critical ?? 0} critical · ${summary?.openFindings?.high ?? 0} high`}
            accent={
              (summary?.openFindings?.critical ?? 0) + (summary?.openFindings?.high ?? 0) > 0
                ? ROLE.critical
                : BRAND.teal
            }
            tint={
              (summary?.openFindings?.critical ?? 0) + (summary?.openFindings?.high ?? 0) > 0
                ? ROLE.criticalSoft
                : BRAND.tealSoft
            }
          />
        </Grid>
      </Grid>

      {/* Framework switcher + per-framework summary ------------------------ */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 2,
          border: `1px solid ${BRAND.border}`,
          mb: 2
        }}
      >
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
      </Paper>

      {/* Device table ------------------------------------------------------ */}
      <Paper
        elevation={0}
        sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }}
      >
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

        {/* Deep-link filter chips. Each chip is deletable — clicking
            the x clears that filter. When there are no active filters
            nothing renders, so the header stays compact by default. */}
        {(severityFilter || platformFilter || versionBucketFilter) ? (
          <Stack direction="row" spacing={0.75} sx={{ mb: 1, flexWrap: "wrap", gap: 0.5 }}>
            <Typography
              variant="caption"
              sx={{ color: BRAND.gray, alignSelf: "center", fontWeight: 600, mr: 0.5 }}
            >
              Applied:
            </Typography>
            {severityFilter ? (
              <Chip
                size="small"
                label={`Severity ≥ ${severityFilter}`}
                onDelete={() => setSeverityFilter("")}
                sx={{ bgcolor: ROLE.criticalSoft, color: ROLE.critical, fontWeight: 600 }}
              />
            ) : null}
            {platformFilter ? (
              <Chip
                size="small"
                label={`Platform: ${platformFilter}`}
                onDelete={() => setPlatformFilter("")}
                sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 600 }}
              />
            ) : null}
            {versionBucketFilter ? (
              <Chip
                size="small"
                label={`Version: ${versionBucketFilter.replace("_", " ")}`}
                onDelete={() => setVersionBucketFilter("")}
                sx={{ bgcolor: ROLE.cautionSoft, color: ROLE.caution, fontWeight: 600 }}
              />
            ) : null}
          </Stack>
        ) : null}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Host</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Platform</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Agent</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Score</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Pass / Applicable</TableCell>
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
                  <TableCell colSpan={8} align="center" sx={{ color: BRAND.gray, py: 3 }}>
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
                          <Typography variant="caption" sx={{ color: BRAND.gray }}>
                            {d.agentId}
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
                        <ScoreBar value={score ?? 0} />
                      </TableCell>
                      <TableCell align="right">
                        {useFw ? `${passed} / ${applicable}` : "—"}
                      </TableCell>
                      <TableCell align="right">
                        <PatchChip patchSummary={d.patchSummary} />
                      </TableCell>
                      <TableCell>
                        {d.collectedAtUtc
                          ? new Date(d.collectedAtUtc).toLocaleString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

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
        />
      </Drawer>
    </Box>
  );
}

// ---------- patch level: drawer section --------------------------------------

/**
 * One row in the "Recent patches" list inside the drawer.
 * Intentionally shows ONLY the KB/HotFix ID (or macOS package name)
 * at rest — expanding reveals the full title, source, and the raw
 * platform-specific record (hotFixId, installedBy, packageIdentifiers,
 * etc). This matches the product decision: the default drill-in view
 * stays scannable, details are available on demand.
 */
function PatchRow({ patch }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasDetails = Boolean(patch?.title || patch?.source || patch?.raw);

  return (
    <Box
      sx={{
        borderTop: `1px solid ${BRAND.border}`,
        py: 0.75,
        "&:first-of-type": { borderTop: "none" }
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: hasDetails ? "pointer" : "default"
        }}
        onClick={() => hasDetails && setExpanded((v) => !v)}
      >
        <Typography
          variant="body2"
          sx={{
            fontFamily: "monospace",
            fontWeight: 700,
            color: BRAND.dark,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {patch?.id || "—"}
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, flexShrink: 0 }}>
          {patch?.installedAtUtc
            ? new Date(patch.installedAtUtc).toLocaleDateString()
            : "—"}
        </Typography>
        {hasDetails ? (
          <IconButton size="small" sx={{ p: 0.25 }}>
            {expanded ? (
              <ExpandLessOutlinedIcon fontSize="small" />
            ) : (
              <ExpandMoreOutlinedIcon fontSize="small" />
            )}
          </IconButton>
        ) : null}
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ mt: 0.75, pl: 0.5 }}>
          {patch?.title ? (
            <Typography variant="body2" sx={{ color: BRAND.dark, mb: 0.5 }}>
              {patch.title}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5, mb: 0.75 }}>
            {patch?.installedAtUtc ? (
              <Chip
                size="small"
                label={`installed ${formatRelativeTime(patch.installedAtUtc)}`}
                sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.dark }}
              />
            ) : null}
            {patch?.source ? (
              <Chip
                size="small"
                label={`source: ${patch.source}`}
                sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.dark }}
              />
            ) : null}
          </Stack>
          {patch?.raw && typeof patch.raw === "object" ? (
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1,
                bgcolor: BRAND.surfaceMuted,
                borderRadius: 1,
                fontSize: 11,
                fontFamily: "monospace",
                color: BRAND.dark,
                overflowX: "auto",
                maxHeight: 180
              }}
            >
              {JSON.stringify(patch.raw, null, 2)}
            </Box>
          ) : null}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * Patch-level section for the device drawer. Three mini-cards at the
 * top (installed count · last patch · last scan) + a compact list of
 * the most recent patches. Uses the shared `patchRecencyRole` helper
 * so coloring stays consistent with the device table.
 */
function PatchLevelSection({ patchSummary, recentPatches }) {
  const hasData =
    patchSummary &&
    (patchSummary.count != null ||
      patchSummary.lastInstalledAtUtc ||
      patchSummary.lastScanUtc);

  if (!hasData) {
    return (
      <Paper
        elevation={0}
        sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }}
      >
        <Typography
          variant="caption"
          sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
        >
          Patch level
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.gray }}>
          This device hasn't reported installed patches yet.
        </Typography>
      </Paper>
    );
  }

  const recency = patchRecencyRole(patchSummary.lastInstalledAtUtc);
  const recencyColor =
    recency.role === "positive"
      ? ROLE.positive
      : recency.role === "caution"
      ? ROLE.caution
      : ROLE.critical;

  return (
    <Paper
      elevation={0}
      sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }}
    >
      <Typography
        variant="caption"
        sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
      >
        Patch level
      </Typography>

      <Grid container spacing={1} sx={{ mb: Array.isArray(recentPatches) && recentPatches.length > 0 ? 1.5 : 0 }}>
        <Grid size={{ xs: 4 }}>
          <Typography variant="caption" sx={{ color: BRAND.gray, textTransform: "uppercase", fontWeight: 600 }}>
            Installed
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>
            {patchSummary.count != null ? patchSummary.count : "—"}
          </Typography>
        </Grid>
        <Grid size={{ xs: 4 }}>
          <Typography variant="caption" sx={{ color: BRAND.gray, textTransform: "uppercase", fontWeight: 600 }}>
            Last patch
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
            {patchSummary.lastInstalledAtUtc
              ? new Date(patchSummary.lastInstalledAtUtc).toLocaleDateString()
              : "—"}
          </Typography>
          <Typography variant="caption" sx={{ color: recencyColor, fontWeight: 600 }}>
            {recency.label}
          </Typography>
        </Grid>
        <Grid size={{ xs: 4 }}>
          <Typography variant="caption" sx={{ color: BRAND.gray, textTransform: "uppercase", fontWeight: 600 }}>
            Last scan
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
            {patchSummary.lastScanUtc
              ? new Date(patchSummary.lastScanUtc).toLocaleDateString()
              : "—"}
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {patchSummary.lastScanUtc
              ? formatRelativeTime(patchSummary.lastScanUtc)
              : ""}
          </Typography>
        </Grid>
      </Grid>

      {Array.isArray(recentPatches) && recentPatches.length > 0 ? (
        <>
          <Typography
            variant="caption"
            sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 0.5 }}
          >
            Recent ({recentPatches.length})
          </Typography>
          <Box>
            {recentPatches.map((patch, idx) => (
              <PatchRow key={`${patch?.id || "unknown"}-${idx}`} patch={patch} />
            ))}
          </Box>
        </>
      ) : null}
    </Paper>
  );
}

// ---------- drawer: drill-down for one device --------------------------------

function DeviceDrawerContent({
  agentId,
  loading,
  data,
  timeseries,
  onClose,
  frameworkLabels,
  onNavigateToAsset
}) {
  if (!agentId) return null;

  const device = data?.device;
  const findings = Array.isArray(data?.findings) ? data.findings : [];

  // Group findings by category for scanning.
  const byCategory = React.useMemo(() => {
    const groups = new Map();
    for (const f of findings) {
      const key = f.category || "other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [findings]);

  const statusCounts = React.useMemo(() => {
    const c = { pass: 0, fail: 0, not_applicable: 0, info: 0, error: 0 };
    for (const f of findings) {
      const k = f.status && c[f.status] !== undefined ? f.status : "error";
      c[k] += 1;
    }
    return c;
  }, [findings]);

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
        <IconButton onClick={onClose} size="small">
          <CloseOutlinedIcon />
        </IconButton>
      </Box>

      {loading ? (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <CircularProgress size={24} sx={{ color: BRAND.teal }} />
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
                  <ScoreBar value={device.overallScore ?? 0} />
                </Box>
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
                  <FindingCard key={f.checkId} finding={f} />
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
    </Box>
  );
}

function FindingCard({ finding }) {
  const meta = STATUS_META[finding.status] ?? STATUS_META.unknown;
  const borderColor = finding.status === "fail" ? `${ROLE.critical}66` : BRAND.border;
  const [open, setOpen] = React.useState(false);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: `1px solid ${borderColor}`,
        bgcolor: finding.status === "fail" ? ROLE.criticalSoft : "transparent",
        transition: "background-color 120ms ease"
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
            <StatusChip status={finding.status} />
            <SeverityChip severity={finding.severity} />
            <Typography variant="caption" sx={{ color: BRAND.gray, fontFamily: "monospace" }}>
              {finding.checkId}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
            {finding.title}
          </Typography>
          {finding.description ? (
            <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 0.25 }}>
              {finding.description}
            </Typography>
          ) : null}

          {/* Framework chips */}
          {Array.isArray(finding.frameworks) && finding.frameworks.length > 0 ? (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}
            >
              {finding.frameworks.map((fw, idx) => (
                <FrameworkChip
                  key={`${fw.framework}:${fw.control_id}:${idx}`}
                  framework={fw.framework}
                  controlId={fw.control_id}
                  controlLevel={fw.control_level}
                  controlTitle={fw.control_title}
                  referenceUrl={fw.reference_url}
                />
              ))}
            </Stack>
          ) : null}
        </Box>
        <Button
          size="small"
          onClick={() => setOpen((v) => !v)}
          sx={{ flexShrink: 0 }}
        >
          {open ? "Hide" : "Details"}
        </Button>
      </Box>

      {open ? (
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px dashed ${BRAND.border}` }}>
          {finding.remediationSummary ? (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ color: BRAND.tealText, fontWeight: 700, textTransform: "uppercase" }}>
                Remediation
              </Typography>
              <Typography variant="body2" sx={{ color: BRAND.dark, mt: 0.25 }}>
                {finding.remediationSummary}
              </Typography>
            </Box>
          ) : null}

          {finding.evidence ? (
            <Box>
              <Typography variant="caption" sx={{ color: BRAND.tealText, fontWeight: 700, textTransform: "uppercase" }}>
                Evidence
              </Typography>
              <Box
                component="pre"
                sx={{
                  mt: 0.5,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: BRAND.surfaceMuted,
                  fontSize: 11,
                  fontFamily: "monospace",
                  maxHeight: 200,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0
                }}
              >
                {JSON.stringify(finding.evidence, null, 2)}
              </Box>
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Paper>
  );
}

// Tiny dependency-free sparkline — the page's footprint in vendor
// bundles is already dominated by MUI/Recharts (loaded for the Overview);
// pulling Recharts just for a 30-point inline graph on a drawer is
// overkill. An SVG polyline is 30 lines and matches the rest of the
// brand palette.
function Sparkline({ points = [] }) {
  if (!points.length) return null;
  const width = 300;
  const height = 40;
  const max = Math.max(100, ...points);
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = height - (p / max) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = points[points.length - 1] ?? 0;
  const strokeColor =
    last >= 85 ? ROLE.positive : last >= 60 ? ROLE.caution : ROLE.critical;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={2} />
    </svg>
  );
}
