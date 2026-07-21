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
import { BRAND, ROLE } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";

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

export function ScoreBar({ value, labelSuffix = "%" }) {
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
          "& .MuiLinearProgress-bar": { backgroundColor: color },
        }}
      />
    </Box>
  );
}

export function Sparkline({ points = [] }) {
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
  const strokeColor = last >= 85 ? ROLE.positive : last >= 60 ? ROLE.caution : ROLE.critical;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={2} />
    </svg>
  );
}
