// src/components/Compliance/ComplianceTrendChart.jsx
//
// Fleet compliance trend for the Security Compliance page — the "are we getting
// better?" chart auditors and CIOs want. Three views over the compliance
// snapshots:
//   * Avg score   — the fleet average score (0–100) over time.
//   * Devices     — compliant vs non-compliant device counts (the remediation
//                   story: "more boxes turned green this quarter").
//   * By framework— one score line per framework (CIS / NIST / …).
//
// Score + Devices are backed by GET /fleet-timeseries; By framework by
// GET /framework-timeseries (recorded from 2026-07 forward, so early days may be
// sparse). A window selector covers the usual audit horizons.

import * as React from "react";
import {
  Box,
  Paper,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Skeleton,
  Chip,
} from "@mui/material";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { BRAND } from "../../theme/brand";
import { CHART_CATEGORICAL } from "../../theme/chartPalette";
import {
  getFleetComplianceTimeseries,
  getFrameworkComplianceTimeseries,
} from "../../api/compliance";

const WINDOWS = [30, 60, 90];
// Per-framework line strokes — see theme/chartPalette (needs wider separation
// than the teal ramp: 7 overlapping lines on one axis).
const FW_COLORS = CHART_CATEGORICAL;

function shortLabel(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "cis_windows_11_v3.0" → "CIS Windows 11 v3.0"
function prettyFramework(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b(cis|nist|pci|iso|soc2|hipaa|csf|stig)\b/gi, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function scoreDelta(buckets) {
  const scored = buckets.filter((b) => Number.isFinite(b.score));
  if (scored.length < 2) return null;
  return {
    diff: Math.round((scored[scored.length - 1].score - scored[0].score) * 10) / 10,
    current: scored[scored.length - 1].score,
  };
}

export default function ComplianceTrendChart({ notify }) {
  const [windowDays, setWindowDays] = React.useState(30);
  const [view, setView] = React.useState("score"); // 'score' | 'devices' | 'framework'
  const [fleet, setFleet] = React.useState([]);
  const [fw, setFw] = React.useState({ frameworks: [], rows: [] });
  const [loading, setLoading] = React.useState(true);

  const isFramework = view === "framework";

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fail = (err) => {
      if (cancelled) return;
      notify?.("error", err?.body?.message || err?.message || "Failed to load compliance trend");
    };

    if (isFramework) {
      getFrameworkComplianceTimeseries(windowDays)
        .then((res) => {
          if (cancelled) return;
          const frameworks = Array.isArray(res?.frameworks) ? res.frameworks : [];
          const rows = (Array.isArray(res?.buckets) ? res.buckets : []).map((b) => ({
            date: b.bucket,
            label: shortLabel(b.bucket),
            ...(b.scores || {}),
          }));
          setFw({ frameworks, rows });
        })
        .catch((err) => {
          if (!cancelled) setFw({ frameworks: [], rows: [] });
          fail(err);
        })
        .finally(() => !cancelled && setLoading(false));
    } else {
      getFleetComplianceTimeseries(windowDays)
        .then((res) => {
          if (cancelled) return;
          const rows = Array.isArray(res?.buckets) ? res.buckets : [];
          setFleet(
            rows.map((b) => ({
              date: b.bucket,
              label: shortLabel(b.bucket),
              score: Number.isFinite(b.avgScore) ? b.avgScore : null,
              compliant: Number(b.compliant ?? 0),
              nonCompliant: Number(b.nonCompliant ?? 0),
            }))
          );
        })
        .catch((err) => {
          if (!cancelled) setFleet([]);
          fail(err);
        })
        .finally(() => !cancelled && setLoading(false));
    }
    return () => {
      cancelled = true;
    };
  }, [windowDays, isFramework, notify]);

  const delta = view === "score" ? scoreDelta(fleet) : null;
  const enoughData = isFramework
    ? fw.rows.length >= 1 && fw.frameworks.length >= 1
    : fleet.filter((b) => Number.isFinite(b.score)).length >= 2;

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: 15 }}>Compliance trend</Typography>
        {delta ? (
          <Chip
            size="small"
            label={`${delta.diff >= 0 ? "▲ +" : "▼ "}${delta.diff} pts · now ${delta.current}/100`}
            sx={{
              height: 22, fontSize: 11, fontWeight: 700,
              bgcolor: delta.diff >= 0 ? BRAND.alert?.successSoft : BRAND.alert?.errorSoft,
              color: delta.diff >= 0 ? BRAND.alert?.success : BRAND.alert?.error,
            }}
          />
        ) : null}
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup exclusive size="small" value={view} onChange={(_e, v) => v && setView(v)} sx={toggleSx}>
          <ToggleButton value="score">Avg score</ToggleButton>
          <ToggleButton value="devices">Devices</ToggleButton>
          <ToggleButton value="framework">By framework</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup exclusive size="small" value={windowDays} onChange={(_e, v) => v && setWindowDays(v)} sx={toggleSx}>
          {WINDOWS.map((w) => (
            <ToggleButton key={w} value={w}>{w}d</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {loading ? (
        <Skeleton variant="rounded" height={200} />
      ) : !enoughData ? (
        <Box sx={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: BRAND.gray }}>
          <Typography variant="caption">
            {isFramework
              ? "No per-framework data yet (recorded from now on)"
              : fleet.length === 0
              ? "No compliance snapshots yet"
              : "Need at least 2 days of data"}
          </Typography>
        </Box>
      ) : isFramework ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={fw.rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: BRAND.gray }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={32} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: BRAND.gray }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BRAND.border}` }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {fw.frameworks.map((f, i) => (
              <Line
                key={f}
                type="monotone"
                dataKey={f}
                name={prettyFramework(f)}
                stroke={FW_COLORS[i % FW_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={fleet} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="scpScoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND.teal} stopOpacity={0.35} />
                <stop offset="100%" stopColor={BRAND.teal} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: BRAND.gray }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={32} />
            {view === "score" ? (
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: BRAND.gray }} axisLine={false} tickLine={false} width={30} />
            ) : (
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: BRAND.gray }} axisLine={false} tickLine={false} width={30} />
            )}
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BRAND.border}` }}
              labelFormatter={(_, p) => {
                const iso = p?.[0]?.payload?.date;
                return iso ? new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";
              }}
            />
            {view === "score" ? (
              <Area type="monotone" dataKey="score" name="Avg score" stroke={BRAND.teal} strokeWidth={2} fill="url(#scpScoreFill)" isAnimationActive={false} connectNulls />
            ) : (
              <>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="compliant" name="Compliant" stackId="d" stroke={BRAND.alert?.success} fill={BRAND.alert?.success} fillOpacity={0.5} isAnimationActive={false} />
                <Area type="monotone" dataKey="nonCompliant" name="Non-compliant" stackId="d" stroke={BRAND.alert?.error} fill={BRAND.alert?.error} fillOpacity={0.5} isAnimationActive={false} />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Paper>
  );
}

const toggleSx = {
  "& .MuiToggleButton-root": {
    textTransform: "none", px: 1.25, py: 0.25, fontSize: 12, fontWeight: 700, color: BRAND.gray, borderColor: BRAND.border,
    "&.Mui-selected": { color: BRAND.teal, bgcolor: BRAND.tealSoft, "&:hover": { bgcolor: BRAND.tealSoft } },
  },
};
