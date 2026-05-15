// src/components/Overview/ComplianceTrendCard.jsx
//
// U2 — fleet-wide compliance score trend over the last 30 days. One
// point per day = average of each device's latest scored snapshot
// that day. Backend rollup lives at:
//   GET /api/v1/security/compliance/fleet-timeseries?windowDays=30
//
// Why a dedicated card (rather than a sparkline on the Compliance
// HeroKpi): a single hero number ("84%") doesn't answer "is the fleet
// trending up or down?". Operators care about the SLOPE — a fleet at
// 84% that was 70% last week is a different story from a fleet at 84%
// that was 90% last week. This card surfaces that delta inline.
//
// Renders a small recharts AreaChart. Same recharts dependency the
// rest of the Overview already uses (AuditTimeseriesChart, etc.) —
// no new bundle weight.

import { useMemo } from "react";
import { Paper, Box, Typography, Skeleton, Stack, Chip } from "@mui/material";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import TrendingFlatOutlinedIcon from "@mui/icons-material/TrendingFlatOutlined";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { BRAND, ROLE } from "../../theme/brand";

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

// Compute "current vs. 7-days-ago" delta. Returns null when either
// endpoint lacks a value, so the chip can render "—" instead of
// fabricating a 0% change.
function computeDelta(buckets) {
  if (!Array.isArray(buckets) || buckets.length < 2) return null;
  const scored = buckets.filter((b) => Number.isFinite(b?.avgScore));
  if (scored.length < 2) return null;
  const last = scored[scored.length - 1];
  // Compare against the bucket closest to 7 days before the last one
  // (not just "the 7th-from-end" — gaps in reporting would skew that).
  const targetMs = Date.parse(last.bucket) - 7 * 86_400_000;
  let baseline = scored[0];
  for (const b of scored) {
    if (Date.parse(b.bucket) <= targetMs) baseline = b;
    else break;
  }
  const diff = last.avgScore - baseline.avgScore;
  return { diff, current: last.avgScore, baselineDate: baseline.bucket };
}

function renderDeltaIcon(diff, color) {
  // Inline-render to avoid the React 19 "no dynamic component during
  // render" rule firing when we assign a component reference to a
  // local variable. Each branch is a literal JSX element.
  if (diff == null || (diff > -1 && diff < 1)) {
    return <TrendingFlatOutlinedIcon style={{ color }} fontSize="small" />;
  }
  if (diff > 0) {
    return <TrendingUpOutlinedIcon style={{ color }} fontSize="small" />;
  }
  return <TrendingDownOutlinedIcon style={{ color }} fontSize="small" />;
}

function deltaColor(diff) {
  if (diff == null) return { fg: BRAND.gray, bg: BRAND.darkSoft };
  if (diff > 1) return { fg: ROLE.positive, bg: ROLE.positiveSoft };
  if (diff < -1) return { fg: ROLE.critical, bg: ROLE.criticalSoft };
  return { fg: BRAND.gray, bg: BRAND.darkSoft };
}

export default function ComplianceTrendCard({ result, loading, onNavigate }) {
  const data = getValue(result);
  const buckets = Array.isArray(data?.buckets) ? data.buckets : [];

  // recharts needs numeric points — drop nulls (sparse-data gaps) so
  // the area path doesn't render as a flat baseline through them.
  // The cost is that the X-axis stops being uniformly spaced, but the
  // alternative (interpolating across gaps) lies to the operator.
  const chartData = useMemo(
    () =>
      buckets
        .filter((b) => Number.isFinite(b?.avgScore))
        .map((b) => ({
          date: b.bucket,
          // Short label "May 14"; tooltip carries the full ISO date.
          label: new Date(b.bucket).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
          score: b.avgScore,
          devices: b.devicesScored ?? 0,
        })),
    [buckets]
  );

  const delta = useMemo(() => computeDelta(buckets), [buckets]);
  const dcolor = deltaColor(delta?.diff);
  const deltaIconEl = renderDeltaIcon(delta?.diff, dcolor.fg);

  const interactive = typeof onNavigate === "function";
  const navigate = () => onNavigate?.("ad");

  // Latest score gets formatted with a single decimal so a 0.3-point
  // movement isn't hidden by rounding. The hero KPI uses Math.round
  // because integer numbers feel friendlier at the top of the page;
  // here the SLOPE is the point, so we keep the precision visible.
  const currentValue =
    delta?.current != null ? delta.current.toFixed(1) : null;
  const deltaLabel =
    delta?.diff != null
      ? `${delta.diff > 0 ? "+" : ""}${delta.diff.toFixed(1)} vs 7d`
      : "—";

  return (
    <Paper
      elevation={0}
      onClick={interactive ? navigate : undefined}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        "&:hover": interactive
          ? { borderColor: BRAND.teal, boxShadow: "0 4px 12px rgba(59,64,77,0.08)" }
          : undefined,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography
            variant="subtitle2"
            sx={{ color: BRAND.dark, fontWeight: 700 }}
          >
            Compliance trend
            <Typography
              component="span"
              variant="caption"
              sx={{ color: BRAND.gray, ml: 0.75, fontWeight: 500 }}
            >
              (last {data?.windowDays ?? 30}d · fleet avg)
            </Typography>
          </Typography>
          {currentValue != null ? (
            <Typography
              sx={{
                fontSize: 28,
                fontWeight: 800,
                color: BRAND.dark,
                lineHeight: 1.1,
                mt: 0.25,
              }}
            >
              {currentValue}
              <Typography
                component="span"
                sx={{ fontSize: 14, color: BRAND.gray, ml: 0.5 }}
              >
                /100
              </Typography>
            </Typography>
          ) : null}
        </Box>
        <Chip
          icon={deltaIconEl}
          label={deltaLabel}
          size="small"
          sx={{
            bgcolor: dcolor.bg,
            color: dcolor.fg,
            fontWeight: 700,
            fontSize: 11,
            "& .MuiChip-icon": { color: dcolor.fg },
          }}
        />
      </Stack>

      <Box sx={{ flex: 1, minHeight: 140 }}>
        {loading ? (
          <Skeleton variant="rounded" height={140} />
        ) : chartData.length < 2 ? (
          <Box
            sx={{
              height: 140,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: BRAND.gray,
            }}
          >
            <Typography variant="caption">
              {chartData.length === 0
                ? "No compliance snapshots yet"
                : "Need at least 2 days of data"}
            </Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient id="complianceTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND.teal} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BRAND.teal} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={BRAND.border}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: BRAND.gray }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={32}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                tick={{ fontSize: 10, fill: BRAND.gray }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: `1px solid ${BRAND.border}`,
                }}
                formatter={(value, name, payload) => {
                  if (name === "score") {
                    const dev = payload?.payload?.devices ?? 0;
                    return [`${value} / 100 (${dev} dev)`, "Avg score"];
                  }
                  return [value, name];
                }}
                labelFormatter={(_, payload) => {
                  const iso = payload?.[0]?.payload?.date;
                  return iso
                    ? new Date(iso).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    : "";
                }}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke={BRAND.teal}
                strokeWidth={2}
                fill="url(#complianceTrendFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Paper>
  );
}
