// src/components/Overview/JobsTimeseriesChart.jsx
//
// Three-line chart of orchestrator jobs per day, split into completed /
// failed / in-flight over the last 7 days. Consumes:
//   { windowDays: 7, buckets: [{ bucket, completed, failed, inFlight, total }] }
// returned by GET /api/v1/orchestrator/jobs/timeseries?window=7d.
//
// Two shapes, chosen by `variant`:
//
//   "line" (default) — three separate lines. On Overview the card is one
//     tile among many and the question is "did more fail today than
//     usual?", read independently of total volume.
//
//   "stacked" — stacked bars, used by the Jobs page. There the chart is
//     the page's own subject sitting above the history it summarises, and
//     the question becomes "how much of the day's work failed": a
//     proportion, which a stack shows as a band and three lines do not.
//     The failed series sits on top so its band is the one that grows into
//     empty space instead of being squeezed between the other two.
//
// Failed uses the red role color in both.

import { useEffect, useState } from "react";
import { Paper, Typography, Box, Skeleton, Stack } from "@mui/material";
import { getJobsTimeseries } from "../../api/overview";
import WindowToggle from "./WindowToggle";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from "recharts";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

function formatDay(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

export default function JobsTimeseriesChart({
  result,
  loading,
  onNavigate,
  // Optional controlled-mode props. When both are supplied (as on the
  // Jobs page, where a companion "Jobs by type" card shares the same
  // window), the chart lifts its window-days state to the parent and
  // skips its internal override fetch — the parent becomes the sole
  // source of truth. Omitting them keeps the original self-contained
  // behaviour intact (as on Overview).
  windowDays: windowDaysProp,
  onWindowDaysChange,
  // "line" | "stacked" — see the header comment. Default keeps Overview
  // and Software Delivery exactly as they were.
  variant = "line",
}) {
  // Same override pattern as AuditTimeseriesChart. See the comments
  // there for the rationale — we keep the two charts structurally
  // identical so they stay easy to refactor together.
  const parentValue =
    result?.status === "fulfilled" ? result.value : null;
  const parentWindow = parentValue?.windowDays ?? 7;

  const controlled = windowDaysProp != null && typeof onWindowDaysChange === "function";

  const [internalWindowDays, setInternalWindowDays] = useState(parentWindow);
  const windowDays = controlled ? windowDaysProp : internalWindowDays;
  const setWindowDays = controlled ? onWindowDaysChange : setInternalWindowDays;

  const [override, setOverride] = useState(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (controlled) return; // parent owns the window
    setInternalWindowDays(parentWindow);
    setOverride(null);
  }, [controlled, parentWindow]);

  useEffect(() => {
    // In controlled mode the parent also owns data fetching — it
    // passes the correct result via `result` — so skip our override
    // fetch. In uncontrolled mode we only override when the window
    // differs from the parent-supplied data.
    if (controlled) {
      setOverride(null);
      return;
    }
    if (windowDays === parentWindow) {
      setOverride(null);
      return;
    }
    let cancelled = false;
    setToggling(true);
    getJobsTimeseries(windowDays)
      .then((v) => {
        if (!cancelled) setOverride(v);
      })
      .catch(() => {
        if (!cancelled) setOverride(null);
      })
      .finally(() => {
        if (!cancelled) setToggling(false);
      });
    return () => {
      cancelled = true;
    };
  }, [controlled, windowDays, parentWindow]);

  const value = override ?? parentValue;
  const buckets = Array.isArray(value?.buckets) ? value.buckets : [];
  const hasData = buckets.some(
    (b) =>
      (b.completed ?? 0) + (b.failed ?? 0) + (b.inFlight ?? 0) > 0
  );

  const data = buckets.map((b) => ({
    day: formatDay(b.bucket),
    completed: b.completed ?? 0,
    failed: b.failed ?? 0,
    inFlight: b.inFlight ?? 0
  }));

  const effectiveLoading = loading || toggling;

  // Whole-card → Jobs page. Matches the AuditTimeseriesChart pattern.
  const interactive = typeof onNavigate === "function";
  const navigate = () => onNavigate?.("jobs", { window: `${windowDays}d` });

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
          : undefined
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Typography
          variant="subtitle2"
          sx={{ color: BRAND.dark, fontWeight: 700 }}
        >
          Jobs by status — last {windowDays} day{windowDays === 1 ? "" : "s"}
        </Typography>
        <WindowToggle
          value={windowDays}
          onChange={setWindowDays}
          disabled={effectiveLoading}
        />
      </Stack>

      {effectiveLoading ? (
        <Skeleton variant="rounded" height={220} />
      ) : !hasData ? (
        <Box
          sx={{
            height: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: BRAND.gray
          }}
        >
          <Typography variant="caption">No jobs in window</Typography>
        </Box>
      ) : (
        <Box sx={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            {variant === "stacked" ? (
              <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }} barCategoryGap="22%">
                <CartesianGrid stroke={BRAND.border} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: BRAND.dark, fontSize: TEXT.xs }}
                  axisLine={{ stroke: BRAND.borderStrong }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: BRAND.dark, fontSize: TEXT.xs }}
                  axisLine={{ stroke: BRAND.borderStrong }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: BRAND.surfaceMuted }}
                  contentStyle={{
                    borderRadius: 8,
                    border: `1px solid ${BRAND.border}`,
                    fontSize: TEXT.sm
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: TEXT.sm, color: BRAND.dark }}
                  iconType="square"
                />
                {/* Declaration order is bottom-to-top in a Recharts stack, so
                    Failed is declared last to land on top of the column. */}
                <Bar dataKey="completed" name="Completed" stackId="s" fill={ROLE.positive} />
                <Bar dataKey="inFlight" name="In flight" stackId="s" fill={BRAND.cyan} />
                <Bar dataKey="failed" name="Failed" stackId="s" fill={ROLE.critical} radius={[3, 3, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid stroke={BRAND.border} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: BRAND.dark, fontSize: TEXT.xs }}
                  axisLine={{ stroke: BRAND.borderStrong }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: BRAND.dark, fontSize: TEXT.xs }}
                  axisLine={{ stroke: BRAND.borderStrong }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: `1px solid ${BRAND.border}`,
                    fontSize: TEXT.sm
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: TEXT.sm, color: BRAND.dark }}
                  iconType="circle"
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke={ROLE.positive}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="inFlight"
                  name="In flight"
                  stroke={BRAND.teal}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  name="Failed"
                  stroke={ROLE.critical}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
}
