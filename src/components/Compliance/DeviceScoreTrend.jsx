// src/components/Compliance/DeviceScoreTrend.jsx
//
// «Score trend · last 30 days» en la ficha de UN equipo.
//
// Era un Sparkline: una línea sin eje, sin número y sin fechas — se veía que
// subía o bajaba, pero no desde dónde ni hasta dónde. Ahora dice la nota de
// hoy, cuánto se movió en la ventana, y el gráfico lleva eje 0–100 y una
// ayuda con la fecha y la nota de cada punto.
//
// Los puntos vienen de fetchDeviceTimeseries: un día por snapshot VÁLIDO (las
// lecturas fallidas del agente no pintan picos) y el último es la nota
// actual del equipo, la misma que enseña la cabecera de la ficha.

import * as React from "react";
import { Box, Stack, Typography } from "@mui/material";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { DEFAULT_BANDS, scoreBandRole, scoreBandTextRole } from "../../theme/scoreBands";

const shortDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
};

/** Puntos con nota, en orden. Los días sin nota (insufficient_data) no se inventan. */
export function scoredPoints(buckets) {
  return (Array.isArray(buckets) ? buckets : [])
    .filter((b) => b && Number.isFinite(Number(b.score)) && b.score !== null)
    .map((b) => ({ date: String(b.bucket), label: shortDate(String(b.bucket)), score: Number(b.score) }));
}

export default function DeviceScoreTrend({ buckets, windowDays = 30, bands = DEFAULT_BANDS }) {
  const points = React.useMemo(() => scoredPoints(buckets), [buckets]);
  if (points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const diff = last.score - first.score;
  const color = scoreBandRole(last.score, bands) ?? ROLE.critical;
  const textColor = scoreBandTextRole(last.score, bands) ?? BRAND.dark;
  const min = Math.min(...points.map((p) => p.score));
  const max = Math.max(...points.map((p) => p.score));

  return (
    <Box data-testid="device-score-trend">
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
        <Typography
          variant="caption"
          sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase" }}
        >
          Score trend · last {windowDays} days
        </Typography>
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: textColor, lineHeight: 1 }}>
          {last.score}
        </Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>/100 now</Typography>
        {points.length > 1 ? (
          <Typography
            sx={{
              fontSize: TEXT.xs,
              fontWeight: 700,
              color: diff > 0 ? BRAND.alert.successText : diff < 0 ? BRAND.alert.errorText : BRAND.gray,
            }}
          >
            {diff > 0 ? `▲ +${diff}` : diff < 0 ? `▼ ${diff}` : "no change"} since {first.label}
          </Typography>
        ) : null}
        {points.length > 1 && max !== min ? (
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, ml: "auto !important" }}>
            range {min}–{max}
          </Typography>
        ) : null}
      </Stack>
      <Box sx={{ width: "100%", height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={BRAND.border} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: TEXT.xs, fill: BRAND.gray }}
              tickLine={false}
              axisLine={{ stroke: BRAND.border }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tick={{ fontSize: TEXT.xs, fill: BRAND.gray }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value) => [`${value}/100`, "Score"]}
              labelFormatter={(label) => label}
              contentStyle={{ fontSize: TEXT.sm, borderRadius: 6, border: `1px solid ${BRAND.border}` }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke={color}
              strokeWidth={2}
              dot={points.length <= 12 ? { r: 2.5, fill: color } : false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
