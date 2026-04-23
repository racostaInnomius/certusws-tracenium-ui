// src/components/Overview/AuditTimeseriesChart.jsx
//
// Stacked bar chart of security events over the last 7 days, split by
// outcome (ok / rejected / error). Consumes the shape:
//   { windowDays: 7, buckets: [{ bucket: '2026-04-16', ok, rejected, error }, ...] }
// returned by GET /api/v1/security/audit/timeseries?window=7d.
//
// Bars are stacked so one bar per day tells the whole story. Green ok
// traffic dominates on a healthy day; rejected/error visually stick out
// as red/amber, which is exactly the at-a-glance signal a CISO wants.

import { Paper, Typography, Box, Skeleton } from "@mui/material";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from "recharts";
import { BRAND, ROLE } from "../../theme/brand";

function formatDay(isoDate) {
  // isoDate is "YYYY-MM-DD". Show "Apr 17" style on the X-axis so the
  // 7-day window remains readable even on narrow screens.
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

export default function AuditTimeseriesChart({ result, loading }) {
  const value =
    result?.status === "fulfilled" ? result.value : null;

  const buckets = Array.isArray(value?.buckets) ? value.buckets : [];
  const hasData = buckets.some(
    (b) => (b.ok ?? 0) + (b.rejected ?? 0) + (b.error ?? 0) > 0
  );

  const data = buckets.map((b) => ({
    day: formatDay(b.bucket),
    ok: b.ok ?? 0,
    rejected: b.rejected ?? 0,
    error: b.error ?? 0
  }));

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
        variant="subtitle2"
        sx={{ color: BRAND.dark, fontWeight: 700, mb: 1 }}
      >
        Security events — last {value?.windowDays ?? 7} days
      </Typography>

      {loading ? (
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
          <Typography variant="caption">No events in window</Typography>
        </Box>
      ) : (
        <Box sx={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={BRAND.border} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: BRAND.dark, fontSize: 11 }}
                axisLine={{ stroke: BRAND.borderStrong }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: BRAND.dark, fontSize: 11 }}
                axisLine={{ stroke: BRAND.borderStrong }}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: `1px solid ${BRAND.border}`,
                  fontSize: 12
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: BRAND.dark }}
                iconType="circle"
              />
              <Bar dataKey="ok"       name="OK"       stackId="events" fill={ROLE.positive} radius={[0, 0, 0, 0]} />
              <Bar dataKey="rejected" name="Rejected" stackId="events" fill={ROLE.caution}  radius={[0, 0, 0, 0]} />
              <Bar dataKey="error"    name="Error"    stackId="events" fill={ROLE.critical} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
}
