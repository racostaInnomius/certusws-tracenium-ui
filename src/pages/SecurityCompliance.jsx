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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  Grid,
  IconButton,
  LinearProgress,
  Menu,
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
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import LaunchOutlinedIcon from "@mui/icons-material/LaunchOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import GppGoodOutlinedIcon from "@mui/icons-material/GppGoodOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
// Sprint 3 — lifecycle controls
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
// Sprint 4 — diff + export
import DifferenceOutlinedIcon from "@mui/icons-material/DifferenceOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";

import {
  getComplianceSummary,
  getFrameworks,
  getFrameworkSummary,
  getDevicePosture,
  getDeviceDetail,
  getDeviceTimeseries,
  acknowledgeFinding,
  revokeFindingAcknowledgement,
  updateFindingRemediationStatus,
  getFindingHistory,
  // Sprint 4
  getDeviceFindingsDiff,
  buildFindingsCsvUrl
} from "../api/compliance";
import { BRAND, ROLE } from "../theme/brand";

import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import SharedSummaryCard from "../components/common/SummaryCard";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import { useCachedFetch } from "../hooks/useCachedFetch";

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
  },
  // New status (2026-05-20). Distinct from "unknown" so we can tell
  // operators "we don't have enough evidence to score this device yet"
  // (a transient enrollment state, or a host whose evaluator hit fewer
  // than MIN_APPLICABLE_CHECKS_FOR_SCORE applicable rules) vs "the
  // device reported but every rule errored" (true unknown). Same
  // neutral gray visual — both states are "no actionable verdict" —
  // but the label tells the operator what to expect:
  //   "Unknown"   → there's a problem with the evaluator/evidence.
  //   "No data"   → wait for the next reporting cycle.
  insufficient_data: {
    label: "No data",
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

// ── Sprint 3 — remediation lifecycle ────────────────────────────────
//
// Status enum mirrors the backend's CHECK constraint on
// security_compliance_findings.remediation_status. Labels are
// operator-facing ("In progress" not "in_progress"); colors echo the
// finding status colors so a critical/fail finding still stands out
// visually even when its remediation_status is "in_progress".
const REMEDIATION_STATUS_META = {
  open: {
    label: "Open",
    fg: ROLE.critical,
    bg: ROLE.criticalSoft
  },
  in_progress: {
    label: "In progress",
    fg: ROLE.caution,
    bg: ROLE.cautionSoft
  },
  remediated: {
    label: "Remediated",
    fg: ROLE.positive,
    bg: ROLE.positiveSoft
  },
  risk_accepted: {
    label: "Risk accepted",
    fg: BRAND.tealText,
    bg: BRAND.tealSoft
  },
  wont_fix: {
    label: "Won't fix",
    fg: BRAND.gray,
    bg: BRAND.surfaceMuted
  }
};

// Client-side mirror of the backend's transition matrix
// (modules/compliance/finding-lifecycle.service.ts:ALLOWED_TRANSITIONS).
// Used to drive the action menu so the operator only sees valid next
// states. The backend re-validates and returns the canonical
// `allowedTransitions` set on 409, so this is purely for UX
// responsiveness — drift between front and back doesn't break
// anything, it just shows one more option that gets rejected.
const REMEDIATION_TRANSITIONS = {
  open: ["in_progress", "remediated", "risk_accepted", "wont_fix"],
  in_progress: ["remediated", "risk_accepted", "wont_fix", "open"],
  remediated: ["open"],
  risk_accepted: ["open"],
  wont_fix: ["open"]
};

// Terminal transitions that should require an operator-provided note
// (audit-trail quality control — risk-acceptance without a stated
// reason is the kind of thing auditors flag).
const TERMINAL_TRANSITIONS_REQUIRING_NOTE = new Set([
  "risk_accepted",
  "wont_fix"
]);

// Relative-time formatter for "open since" / "acknowledged X ago".
// Reuses the same coarse buckets as formatRelativeTime below — but
// the latter only handles past times and we need it inline in card
// metadata. Centralised here so the two callers stay consistent.
function shortRelativeTime(isoString) {
  if (!isoString) return null;
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return null;
  const deltaMs = Date.now() - then;
  if (deltaMs < 0) return "future";
  const mins = Math.round(deltaMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.round(months / 12);
  return `${years}y`;
}

// ---------- small presentational atoms ---------------------------------------

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

// Sprint 3 — visually distinct from StatusChip (which conveys the
// rule outcome). RemediationStatusChip carries the OPERATOR's
// declared state. Same chip shape so they read at the same visual
// weight in the finding card; different palette so the dual chips
// don't get confused at a glance.
function RemediationStatusChip({ status }) {
  const meta = REMEDIATION_STATUS_META[status] ?? REMEDIATION_STATUS_META.open;
  return (
    <Chip
      label={meta.label}
      size="small"
      sx={{
        bgcolor: meta.bg,
        color: meta.fg,
        fontWeight: 700,
        border: `1px solid ${meta.fg}44`,
        height: 22,
        fontSize: 11
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
  // Three distinct visual states, not two:
  //
  //   - score === null / undefined → "no data" (neutral gray "—",
  //     no bar). Previously we coerced null → 0 with `Number(value) || 0`,
  //     which painted a full-width red bar at "0%" for devices that
  //     had simply not reported a scorable compliance posture yet
  //     (e.g. enrolled <1h, evidence collector still warming up, or
  //     the evaluator's MIN_APPLICABLE_CHECKS_FOR_SCORE threshold
  //     gated the result). That was misleading — "no signal" is not
  //     "catastrophic failure", and the red bar pulled the operator's
  //     eye to devices that didn't actually need attention.
  //
  //   - score === 0 → legacy "0%" rendering, kept for backward
  //     compat with rows persisted before the null-gating landed
  //     (2026-05-20). After ~90 days of snapshot retention this case
  //     disappears.
  //
  //   - score 1..100 → normal progress bar with role-based color.
  //
  // We treat the explicit numeric 0 separately from null because
  // `Number(0) || 0` would otherwise mask a real 0 score behind the
  // null check — JS truthy/falsy on numbers bites here.
  const isNumeric = value !== null && value !== undefined && Number.isFinite(Number(value));
  if (!isNumeric) {
    return (
      <Box sx={{ minWidth: 110 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.gray }}>
          —
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray }}>
          no data
        </Typography>
      </Box>
    );
  }
  const pct = Math.max(0, Math.min(100, Number(value)));
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
  // Collapse accidental `//` in the pathname so pushState doesn't
  // silently reject the URL as cross-origin (see navigateWithQuery
  // comment in Overview.jsx for the full story).
  const pathname = window.location.pathname.replace(/^\/+/, "/") || "/";
  window.history.pushState({}, "", `${pathname}?${params.toString()}`);
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
            {/* Sprint 4 — CSV export. Anchor tag (not a fetch
                button) so the browser handles the streaming
                download natively + shows progress in the chrome.
                The OIDC cookie credential rides along automatically.
                Filter is the currently selected framework so the
                operator can "save what they're looking at" without
                a separate export dialog. */}
            <Tooltip
              title={
                selectedFramework
                  ? `Export findings for ${selectedFrameworkLabel} as CSV`
                  : "Export all findings as CSV (every mapped framework)"
              }
              arrow
              placement="bottom"
            >
              <Button
                component="a"
                href={buildFindingsCsvUrl({
                  framework: selectedFramework || undefined
                })}
                // No target="_blank" — same-tab keeps the OIDC
                // cookie scope; the browser's download dialog
                // handles the rest without leaving the page.
                size="small"
                variant="outlined"
                startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
                sx={{ textTransform: "none" }}
              >
                Export CSV
              </Button>
            </Tooltip>
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
                        {/* Sprint 1 item 3.1 — when a device has
                            insufficient_data status, show an inline
                            caption clarifying this is usually a
                            timing issue (fresh enrollment, partial
                            evidence) rather than a real problem. Reduces
                            operator anxiety + sets the right expectation
                            ("wait, don't escalate"). A future backend
                            change can replace this heuristic with a
                            real "Recently enrolled" detector based on
                            agent.created_at. */}
                        {d.overallStatus === "insufficient_data" ? (
                          <Typography
                            variant="caption"
                            sx={{
                              color: BRAND.teal,
                              fontStyle: "italic",
                              display: "block",
                              mt: 0.25
                            }}
                          >
                            Awaiting first full scan
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
  onNavigateToAsset,
  // Sprint 3 — lifecycle wiring. Provided by the SCP page so the
  // drawer can trigger a parent-side refetch + snackbar after every
  // successful mutation, and the snackbar/dialog state stays at one
  // level instead of being scattered per-card.
  onRequestRefetch,
  onToast
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

  const byCategory = React.useMemo(() => {
    const groups = new Map();
    for (const f of findings) {
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
  }, [findings, findingSortKey]);

  const statusCounts = React.useMemo(() => {
    const c = { pass: 0, fail: 0, not_applicable: 0, info: 0, error: 0 };
    for (const f of findings) {
      const k = f.status && c[f.status] !== undefined ? f.status : "error";
      c[k] += 1;
    }
    return c;
  }, [findings]);

  // ── Sprint 3 — lifecycle mutation state ────────────────────────────
  //
  // pendingAction tracks which finding has a mutation in-flight so
  // FindingCard can disable its buttons + show a spinner without
  // each card holding its own state. One concurrent mutation per
  // drawer is a deliberate simplification: a flurry of clicks on
  // different findings would race against the parent refetch and
  // make the UI feel sluggish; serializing them is fine for an
  // operator workflow.
  const [pendingAction, setPendingAction] = React.useState(null);
  // statusDialog: { finding, targetStatus } when open, null otherwise.
  const [statusDialog, setStatusDialog] = React.useState(null);
  // historyDialog: { finding } when open.
  const [historyDialog, setHistoryDialog] = React.useState(null);

  /**
   * Wraps any lifecycle API call with the standard shape:
   *   - mark pending
   *   - call the helper
   *   - branch on res.ok (parsed business-level result, NOT raw fetch)
   *   - toast + refetch on success, toast on failure
   *   - clear pending
   *
   * Centralised so each mutation site (ack / revoke / status change)
   * stays a one-liner. The helper is intentionally not memoised —
   * its deps would invalidate it on every render anyway because of
   * onRequestRefetch / onToast.
   */
  async function runMutation(finding, apiCall, successMessage) {
    setPendingAction(finding.id);
    try {
      const res = await apiCall();
      if (res?.ok) {
        onToast?.({ severity: "success", message: successMessage });
        // The cache helper in api/http.js invalidates GETs that
        // share the mutation's URL prefix; the drawer's device
        // detail fetch DOES NOT share that prefix, so we explicitly
        // ask the parent to refetch.
        onRequestRefetch?.();
      } else {
        // Backend returned a structured failure (INVALID_TRANSITION,
        // FINDING_CLOSED, FINDING_NOT_FOUND). Surface the human
        // message rather than a generic error.
        onToast?.({
          severity: "warning",
          message: res?.message || "Action was not allowed."
        });
      }
    } catch (err) {
      onToast?.({
        severity: "error",
        message: err?.message || String(err)
      });
    } finally {
      setPendingAction(null);
    }
  }

  function handleAck(finding) {
    return runMutation(
      finding,
      () => acknowledgeFinding(finding.id),
      "Finding acknowledged."
    );
  }
  function handleRevoke(finding) {
    return runMutation(
      finding,
      () => revokeFindingAcknowledgement(finding.id),
      "Acknowledgement revoked."
    );
  }
  function handleChangeStatus(finding, next) {
    // Open the confirmation dialog. Actual API call happens in
    // confirmStatusChange below after the operator types a note
    // (and we validate that terminal transitions HAVE a note).
    setStatusDialog({ finding, targetStatus: next });
  }
  async function confirmStatusChange({ note }) {
    if (!statusDialog) return;
    const { finding, targetStatus } = statusDialog;
    setStatusDialog(null);
    await runMutation(
      finding,
      () =>
        updateFindingRemediationStatus(finding.id, {
          status: targetStatus,
          note
        }),
      `Status set to ${REMEDIATION_STATUS_META[targetStatus]?.label}.`
    );
  }

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
                  {/* Drawer header score — pass null through so the
                      "no data" rendering kicks in for insufficient-
                      data devices instead of showing a fake 0%. */}
                  <ScoreBar value={device.overallScore} />
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

          {/* Sprint 4 — diff vs last scan -------------------------------- */}
          <DeviceDiffSection agentId={agentId} />

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
    </Box>
  );
}

/**
 * Sprint 3 — FindingCard now carries lifecycle controls (acknowledge,
 * remediation-status menu, history) in addition to the rule outcome.
 *
 * Props beyond `finding`:
 *   - `onAck` / `onRevoke`     — toggle the acknowledged_at column
 *   - `onChangeStatus(next)`   — pop the confirmation dialog for the
 *                                requested transition
 *   - `pendingAction`          — string id of an in-flight mutation
 *                                (so we can disable buttons + show
 *                                a spinner without each card holding
 *                                its own mutation state)
 *
 * The card no longer self-manages mutations — the parent drawer owns
 * the snackbar + dialog + refetch logic because all of those are
 * page-level concerns. Cards are kept dumb so they re-render cheaply
 * when the drawer refetches.
 */
function FindingCard({
  finding,
  onAck,
  onRevoke,
  onChangeStatus,
  onShowHistory,
  pendingAction
}) {
  const borderColor = finding.status === "fail" ? `${ROLE.critical}66` : BRAND.border;
  const [open, setOpen] = React.useState(false);

  // Anchor for the remediation-status menu. Local state because the
  // anchor element belongs to a button rendered inside this card.
  const [statusMenuAnchor, setStatusMenuAnchor] = React.useState(null);
  const statusMenuOpen = Boolean(statusMenuAnchor);

  const isAcked = Boolean(finding.acknowledgedAt);
  const remediationStatus = finding.remediationStatus || "open";
  const nextTransitions = REMEDIATION_TRANSITIONS[remediationStatus] || [];

  // A card-level pending flag covers both the ack toggle AND the
  // status menu so the operator sees one in-flight indicator at a
  // time. `pendingAction === finding.id` means THIS card has a
  // mutation in flight.
  const isPending = pendingAction === finding.id;

  const firstSeenAgo = shortRelativeTime(finding.firstSeenAtUtc);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: `1px solid ${borderColor}`,
        bgcolor:
          isAcked && finding.status === "fail"
            ? // Acknowledged fail = soft red (still attention-worthy)
              // but less visually loud than a brand-new fail card.
              `${ROLE.criticalSoft}88`
            : finding.status === "fail"
            ? ROLE.criticalSoft
            : "transparent",
        transition: "background-color 120ms ease",
        // Subtle tint on the right edge to signal "this finding has
        // an operator declared remediation state". Doesn't replace
        // the chip — just helps the eye scan a list of cards.
        boxShadow:
          remediationStatus !== "open"
            ? `inset -3px 0 0 0 ${REMEDIATION_STATUS_META[remediationStatus]?.fg ?? BRAND.gray}`
            : "none"
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
            <StatusChip status={finding.status} />
            <SeverityChip severity={finding.severity} />
            {/* Sprint 3 — show remediation state inline with the
                outcome status so operators can sort/scan by either. */}
            <RemediationStatusChip status={remediationStatus} />
            <Typography variant="caption" sx={{ color: BRAND.gray, fontFamily: "monospace" }}>
              {finding.checkId}
            </Typography>
            {firstSeenAgo ? (
              <Tooltip
                title={`First seen at ${finding.firstSeenAtUtc}`}
                arrow
                placement="top"
              >
                <Typography variant="caption" sx={{ color: BRAND.gray }}>
                  · open {firstSeenAgo}
                </Typography>
              </Tooltip>
            ) : null}
            {isAcked ? (
              <Tooltip
                title={`Acknowledged ${shortRelativeTime(finding.acknowledgedAt) ?? ""} ago${finding.acknowledgedBy ? ` by ${finding.acknowledgedBy}` : ""}`}
                arrow
                placement="top"
              >
                <Chip
                  label="Ack"
                  size="small"
                  icon={<VisibilityOutlinedIcon sx={{ fontSize: 12 }} />}
                  sx={{
                    bgcolor: BRAND.tealSoft,
                    color: BRAND.tealText,
                    fontWeight: 700,
                    height: 22,
                    fontSize: 11,
                    "& .MuiChip-icon": { color: BRAND.tealText }
                  }}
                />
              </Tooltip>
            ) : null}
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

          {/* Sprint 3 — action row. Sits between framework chips and
              the Details collapse so the operator sees:
                - WHAT this finding is (chips + title above)
                - WHAT they can do about it (action row)
                - WHY / EVIDENCE (collapse below)
              Buttons are size="small" so the card height matches the
              pre-Sprint-3 look. Disabled while a mutation is in
              flight. */}
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}
          >
            {isAcked ? (
              <Button
                size="small"
                variant="outlined"
                startIcon={<VisibilityOffOutlinedIcon sx={{ fontSize: 14 }} />}
                onClick={() => onRevoke(finding)}
                disabled={isPending}
                sx={{ textTransform: "none" }}
              >
                Revoke ack
              </Button>
            ) : (
              <Button
                size="small"
                variant="outlined"
                startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 14 }} />}
                onClick={() => onAck(finding)}
                disabled={isPending}
                sx={{ textTransform: "none" }}
              >
                Acknowledge
              </Button>
            )}
            {nextTransitions.length > 0 ? (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<ExpandMoreOutlinedIcon sx={{ fontSize: 14 }} />}
                  onClick={(e) => setStatusMenuAnchor(e.currentTarget)}
                  disabled={isPending}
                  sx={{ textTransform: "none" }}
                >
                  Change status
                </Button>
                <Menu
                  anchorEl={statusMenuAnchor}
                  open={statusMenuOpen}
                  onClose={() => setStatusMenuAnchor(null)}
                  // anchorOrigin defaults to top-left; use bottom-left
                  // so the menu opens BELOW the trigger, otherwise it
                  // can clip against the drawer's top edge on the
                  // first finding.
                  anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                >
                  {nextTransitions.map((next) => (
                    <MenuItem
                      key={next}
                      onClick={() => {
                        setStatusMenuAnchor(null);
                        onChangeStatus(finding, next);
                      }}
                    >
                      <RemediationStatusChip status={next} />
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        Mark {REMEDIATION_STATUS_META[next]?.label.toLowerCase()}
                      </Typography>
                    </MenuItem>
                  ))}
                </Menu>
              </>
            ) : null}
            <Button
              size="small"
              variant="text"
              startIcon={<HistoryOutlinedIcon sx={{ fontSize: 14 }} />}
              onClick={() => onShowHistory(finding)}
              disabled={isPending}
              sx={{ textTransform: "none" }}
            >
              History
            </Button>
            {isPending ? (
              <CircularProgress size={16} sx={{ ml: 0.5, alignSelf: "center" }} />
            ) : null}
          </Stack>
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

// ── Sprint 3 — finding history dialog ─────────────────────────────────
//
// Opens from the "History" button on a FindingCard. Loads
// compliance_finding_events for the finding lazily (only when the
// dialog opens) so the device drawer's initial render isn't slowed
// down by an extra request per finding. One outstanding request at
// a time per dialog — closing while loading just discards the result
// when it arrives.
function FindingHistoryDialog({ open, finding, onClose }) {
  const [events, setEvents] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open || !finding?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvents(null);
    getFindingHistory(finding.id, { limit: 200 })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) {
          setEvents(Array.isArray(res.events) ? res.events : []);
        } else {
          setError(res?.message || "Failed to load history.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, finding?.id]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      // Stack ABOVE the device drawer (drawer's MUI z-index is 1200).
      sx={{ "& .MuiDialog-paper": { borderRadius: 2 } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: BRAND.dark }}>
          Finding history
        </Typography>
        {finding ? (
          <Typography variant="caption" sx={{ color: BRAND.gray, fontFamily: "monospace" }}>
            {finding.checkId}
          </Typography>
        ) : null}
      </DialogTitle>
      <DialogContent sx={{ minHeight: 200 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : events && events.length > 0 ? (
          <Stack spacing={1.25} sx={{ pt: 1 }}>
            {events.map((evt) => (
              <Box
                key={evt.id}
                sx={{
                  p: 1.25,
                  borderRadius: 1,
                  border: `1px solid ${BRAND.border}`,
                  bgcolor: BRAND.surfaceMuted
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
                    {humanizeEventType(evt.eventType)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    · {new Date(evt.atUtc).toLocaleString()}
                  </Typography>
                </Stack>
                {evt.actorUserId ? (
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    by {evt.actorUserId}
                  </Typography>
                ) : (
                  <Typography variant="caption" sx={{ color: BRAND.gray, fontStyle: "italic" }}>
                    system
                  </Typography>
                )}
                {evt.previousValue || evt.newValue ? (
                  <Box
                    sx={{
                      mt: 0.5,
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: BRAND.dark
                    }}
                  >
                    {evt.previousValue
                      ? `from: ${JSON.stringify(evt.previousValue)}`
                      : null}
                    {evt.previousValue && evt.newValue ? <br /> : null}
                    {evt.newValue
                      ? `to: ${JSON.stringify(evt.newValue)}`
                      : null}
                  </Box>
                ) : null}
                {evt.note ? (
                  <Typography
                    variant="caption"
                    sx={{ color: BRAND.dark, mt: 0.5, display: "block" }}
                  >
                    “{evt.note}”
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        ) : (
          <DialogContentText sx={{ color: BRAND.gray, fontStyle: "italic", pt: 1 }}>
            No events recorded yet.
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// Map machine event_type → human label. Kept inline here (not in
// REMEDIATION_STATUS_META) because event_type isn't the same enum
// space as remediation_status.
function humanizeEventType(t) {
  switch (t) {
    case "opened":
      return "Opened";
    case "closed":
      return "Closed";
    case "reopened":
      return "Reopened";
    case "acknowledged":
      return "Acknowledged";
    case "acknowledgement_revoked":
      return "Acknowledgement revoked";
    case "remediation_status_changed":
      return "Remediation status changed";
    case "evidence_refreshed":
      return "Evidence refreshed";
    default:
      return t;
  }
}

// ── Sprint 3 — status-change confirmation dialog ──────────────────────
//
// Pops when the operator picks a transition from the action menu.
// For terminal states (risk_accepted / wont_fix) we REQUIRE a note
// so the audit trail captures the rationale. For other transitions
// the note is optional but still surfaced — risk-accepting WITHOUT
// a paper trail is one of the things auditors look for.
function StatusChangeDialog({ open, finding: _finding, targetStatus, onConfirm, onCancel }) {
  const [note, setNote] = React.useState("");
  const requiresNote = TERMINAL_TRANSITIONS_REQUIRING_NOTE.has(targetStatus);
  const canSubmit = !requiresNote || note.trim().length > 0;

  // Reset the note when the dialog reopens for a different
  // transition. Without this the note text from a previous click
  // would leak into the next confirmation.
  React.useEffect(() => {
    if (open) setNote("");
  }, [open]);

  if (!targetStatus) return null;

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        Mark as {REMEDIATION_STATUS_META[targetStatus]?.label.toLowerCase()}?
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {requiresNote
            ? "This is a terminal state. Please provide a brief justification — it will be recorded in the audit log."
            : "Optionally add a note for the audit log."}
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          maxRows={6}
          placeholder={
            requiresNote
              ? "e.g. Mitigated via network ACL; revisit Q3."
              : "Optional note"
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required={requiresNote}
          error={requiresNote && note.trim().length === 0}
          helperText={
            requiresNote && note.trim().length === 0
              ? "A note is required for this transition."
              : " "
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => onConfirm({ note: note.trim() || null })}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Sprint 4 — "what changed since last scan" section ───────────────
//
// Collapsed by default — most users land in the drawer to triage the
// current state of findings, not to do diff analysis. Operators
// looking for "did my last fix take" expand it and get the three
// buckets: added, removed (resolved), and severity/status changes.
//
// Lazily loads the diff on first expand to avoid spending a request
// + DB CTE every time the drawer opens. Cancelled cleanly if the
// drawer closes mid-fetch.
function DeviceDiffSection({ agentId }) {
  const [expanded, setExpanded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [diff, setDiff] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [fetched, setFetched] = React.useState(false);

  // Trigger the fetch the first time the section is expanded, AND any
  // time the agent changes while expanded (e.g. user navigates from
  // one device to another without closing the drawer — uncommon but
  // possible).
  React.useEffect(() => {
    if (!expanded || !agentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDeviceFindingsDiff(agentId)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) {
          setDiff(res.diff ?? null);
          setFetched(true);
        } else {
          setError(res?.message || "Failed to load diff.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, agentId]);

  const hasReference = diff?.referenceSnapshotAt != null;
  const added = diff?.added ?? [];
  const removed = diff?.removed ?? [];
  const severityChanged = diff?.severityChanged ?? [];
  const statusChanged = diff?.statusChanged ?? [];
  const totalChanges =
    added.length + removed.length + severityChanged.length + statusChanged.length;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        mb: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer"
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <DifferenceOutlinedIcon sx={{ fontSize: 18, color: BRAND.tealText }} />
        <Typography
          variant="caption"
          sx={{
            color: BRAND.tealText,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            flex: 1
          }}
        >
          Changes since last scan
        </Typography>
        {/* Mini-badge when collapsed so the operator sees there's
            something worth expanding without opening it. Only
            renders after the first fetch (`fetched`) so we don't
            mislead the user with a "0 changes" before we know. */}
        {fetched && !expanded ? (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {totalChanges === 0 ? "no changes" : `${totalChanges} change${totalChanges === 1 ? "" : "s"}`}
          </Typography>
        ) : null}
        <IconButton size="small" sx={{ ml: 0.5 }}>
          {expanded ? (
            <ExpandLessOutlinedIcon fontSize="small" />
          ) : (
            <ExpandMoreOutlinedIcon fontSize="small" />
          )}
        </IconButton>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ mt: 1.5 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : !hasReference ? (
            <Typography variant="body2" sx={{ color: BRAND.gray, fontStyle: "italic" }}>
              No prior scan to compare against. Once this device reports a
              second snapshot, this section will show the delta.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                Comparing{" "}
                <strong>
                  {diff.currentSnapshotAt
                    ? new Date(diff.currentSnapshotAt).toLocaleString()
                    : "current"}
                </strong>{" "}
                vs{" "}
                <strong>
                  {new Date(diff.referenceSnapshotAt).toLocaleString()}
                </strong>
              </Typography>

              {totalChanges === 0 ? (
                <Alert severity="success" icon={false} sx={{ py: 0.5 }}>
                  No changes since the prior scan.
                </Alert>
              ) : null}

              <DiffBucket
                title="New findings"
                items={added.map((f) => `${f.severity ?? "?"} · ${f.checkId} — ${f.title ?? ""}`)}
                color={ROLE.critical}
                icon={<AddCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
              />
              <DiffBucket
                title="Resolved"
                items={removed.map((f) => `${f.severity ?? "?"} · ${f.checkId} — ${f.title ?? ""}`)}
                color={ROLE.positive}
                icon={<RemoveCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
              />
              <DiffBucket
                title="Severity changed"
                items={severityChanged.map(
                  (c) => `${c.checkId}: ${c.before ?? "?"} → ${c.after ?? "?"}`
                )}
                color={ROLE.caution}
                icon={<SwapHorizOutlinedIcon sx={{ fontSize: 14 }} />}
              />
              <DiffBucket
                title="Status changed"
                items={statusChanged.map(
                  (c) => `${c.checkId}: ${c.before ?? "?"} → ${c.after ?? "?"}`
                )}
                color={ROLE.caution}
                icon={<SwapHorizOutlinedIcon sx={{ fontSize: 14 }} />}
              />
            </Stack>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// Hidden when items array is empty — keeps the diff section compact
// for the common "only one bucket has content" case.
function DiffBucket({ title, items, color, icon }) {
  if (!items || items.length === 0) return null;
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
        <Box sx={{ color, display: "flex" }}>{icon}</Box>
        <Typography
          variant="caption"
          sx={{ color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}
        >
          {title} ({items.length})
        </Typography>
      </Stack>
      <Box
        component="ul"
        sx={{
          m: 0,
          pl: 2.5,
          color: BRAND.dark,
          fontSize: 13,
          lineHeight: 1.55
        }}
      >
        {items.map((line, idx) => (
          <li key={idx}>
            <Typography variant="body2" component="span">
              {line}
            </Typography>
          </li>
        ))}
      </Box>
    </Box>
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
