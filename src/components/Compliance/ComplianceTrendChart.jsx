// src/components/Compliance/ComplianceTrendChart.jsx
//
// Fleet compliance trend for the Security Compliance page — the "are we getting
// better?" chart auditors and CIOs want. Backed by the existing
// GET /api/v1/security/compliance/fleet-timeseries (avg score + compliant /
// non-compliant device counts per day, latest snapshot per device per day).
//
// Two views over the same data: the fleet average score (0–100) over time, and
// the compliant-vs-non-compliant device split — the second tells the remediation
// story ("more boxes turned green this quarter"). A window selector covers the
// usual audit horizons.

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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { BRAND } from "../../theme/brand";
import { getFleetComplianceTimeseries } from "../../api/compliance";

const WINDOWS = [30, 60, 90];

function shortLabel(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// First → last delta over the scored buckets.
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
  const [view, setView] = React.useState("score"); // 'score' | 'devices'
  const [buckets, setBuckets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFleetComplianceTimeseries(windowDays)
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.buckets) ? res.buckets : [];
        setBuckets(
          rows.map((b) => ({
            date: b.bucket,
            label: shortLabel(b.bucket),
            score: Number.isFinite(b.avgScore) ? b.avgScore : null,
            devices: Number(b.devicesScored ?? 0),
            compliant: Number(b.compliant ?? 0),
            nonCompliant: Number(b.nonCompliant ?? 0),
          }))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setBuckets([]);
        notify?.("error", err?.body?.message || err?.message || "Failed to load compliance trend");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [windowDays, notify]);

  const delta = scoreDelta(buckets);
  const enoughData = buckets.filter((b) => Number.isFinite(b.score)).length >= 2;

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
        <ToggleButtonGroup
          exclusive size="small" value={view} onChange={(_e, v) => v && setView(v)}
          sx={toggleSx}
        >
          <ToggleButton value="score">Avg score</ToggleButton>
          <ToggleButton value="devices">Devices</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          exclusive size="small" value={windowDays} onChange={(_e, v) => v && setWindowDays(v)}
          sx={toggleSx}
        >
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
            {buckets.length === 0 ? "No compliance snapshots yet" : "Need at least 2 days of data"}
          </Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={buckets} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
