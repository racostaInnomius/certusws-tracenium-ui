// src/components/Compliance/complianceChips.jsx
//
// Pure presentational atoms extracted from the SecurityCompliance page (which
// was a 3,200-line god-component). These carry real presentation logic worth
// testing in isolation — severity → color, framework abbreviation + control
// level, the three-state score bar, and the sparkline path — with no data
// fetching or page state. Extracted so the page shrinks and these are unit
// tested + reusable across compliance surfaces.

import { Box, Chip, LinearProgress, Tooltip, Typography } from "@mui/material";
import LaunchOutlinedIcon from "@mui/icons-material/LaunchOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { DEFAULT_BANDS, scoreBandRole } from "../../theme/scoreBands";

// Rule-outcome status presentation. Exported because non-chip parts of the
// compliance page key off it too (this was shared module-level state in the
// old god-component).
export const STATUS_META = {
  pass: { label: "Pass", icon: <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />, fg: ROLE.positive, bg: ROLE.positiveSoft },
  fail: { label: "Fail", icon: <ErrorOutlineOutlinedIcon sx={{ fontSize: 14 }} />, fg: ROLE.critical, bg: ROLE.criticalSoft },
  not_applicable: { label: "N/A", icon: <BlockOutlinedIcon sx={{ fontSize: 14 }} />, fg: BRAND.gray, bg: BRAND.surfaceMuted },
  info: { label: "Info", icon: <InfoOutlinedIcon sx={{ fontSize: 14 }} />, fg: BRAND.teal, bg: BRAND.tealSoft },
  error: { label: "Error", icon: <HelpOutlineOutlinedIcon sx={{ fontSize: 14 }} />, fg: ROLE.caution, bg: ROLE.cautionSoft },
  unknown: { label: "Unknown", icon: <HelpOutlineOutlinedIcon sx={{ fontSize: 14 }} />, fg: BRAND.gray, bg: BRAND.surfaceMuted },
  // "No data" (transient: enrolled <1 cycle, or fewer than the scoring
  // threshold of applicable rules) — distinct from "Unknown" (evaluator/
  // evidence problem). Same neutral gray; the label tells the operator whether
  // to wait or investigate.
  insufficient_data: { label: "No data", icon: <HelpOutlineOutlinedIcon sx={{ fontSize: 14 }} />, fg: BRAND.gray, bg: BRAND.surfaceMuted },
};

// Operator-declared remediation state (mirrors the backend CHECK constraint on
// security_compliance_findings.remediation_status). Colors echo the finding
// status palette so a critical finding still stands out under "in progress".
export const REMEDIATION_STATUS_META = {
  open: { label: "Open", fg: ROLE.critical, bg: ROLE.criticalSoft },
  in_progress: { label: "In progress", fg: ROLE.caution, bg: ROLE.cautionSoft },
  remediated: { label: "Remediated", fg: ROLE.positive, bg: ROLE.positiveSoft },
  risk_accepted: { label: "Risk accepted", fg: BRAND.tealText, bg: BRAND.tealSoft },
  wont_fix: { label: "Won't fix", fg: BRAND.gray, bg: BRAND.surfaceMuted },
};

export function StatusChip({ status }) {
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
        "& .MuiChip-icon": { color: meta.fg },
      }}
    />
  );
}

export function RemediationStatusChip({ status }) {
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
        fontSize: 11,
      }}
    />
  );
}

// Canonical severity scale (theme/severity.js). Kept as a map (rather than a
// direct severityMeta() call) to preserve the page's existing "unknown →
// medium" fallback.
const SEVERITY_META = {
  critical: severityMeta("critical"),
  high: severityMeta("high"),
  medium: severityMeta("medium"),
  low: severityMeta("low"),
  info: severityMeta("info"),
};

export function SeverityChip({ severity }) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.medium;
  return (
    <Chip
      label={meta.label}
      size="small"
      sx={{
        bgcolor: meta.bg,
        color: meta.fg,
        fontWeight: 700,
        border: `1px solid ${meta.fg}44`,
      }}
    />
  );
}

export function FrameworkChip({ framework, controlId, controlLevel, controlTitle, referenceUrl }) {
  // Short label: "CIS 9.3.1 · L1" / "NIST SC-7(5)" / "CSF PR.IR-01" /
  // "STIG V-253xxx · CAT I". Tooltip carries the full control title.
  const fam = framework.startsWith("cis_")
    ? "CIS"
    : framework.startsWith("nist_csf")
    ? "CSF"
    : framework.startsWith("nist_800_53")
    ? "NIST"
    : framework.startsWith("stig_")
    ? "STIG"
    : framework;

  // CIS levels (L1/L2) and STIG severities (CAT I/II/III) are meaningful, so we
  // suffix them; NIST/CSF control levels ("baseline"/"core") are noise here.
  const label =
    controlLevel && (fam === "CIS" || fam === "STIG")
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
        "& .MuiChip-icon": { color: BRAND.dark, marginLeft: "6px" },
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

export function ScoreBar({ value, labelSuffix = "%", bands = DEFAULT_BANDS }) {
  // Three distinct visual states: null/undefined → "no data" (neutral, no
  // bar), an explicit 0 → "0%", and 1..100 → a role-colored bar. We treat 0
  // separately from null because `Number(0) || 0` would mask a real 0 score.
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
  // Band colors come from the tenant's configured thresholds (Sprint 2
  // item 1) — callers pass `bands` from useComplianceBands(); the
  // default is the same 85/60 scale this used to hardcode.
  const color = scoreBandRole(pct, bands) ?? ROLE.critical;
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
          "& .MuiLinearProgress-bar": { backgroundColor: color },
        }}
      />
    </Box>
  );
}

export function Sparkline({ points = [], bands = DEFAULT_BANDS }) {
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
  const strokeColor = scoreBandRole(last, bands) ?? ROLE.critical;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={2} />
    </svg>
  );
}
