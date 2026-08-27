// src/components/software-delivery/InstallsOverTimeChart.jsx
//
// Per-device install outcomes by day, on the Software Delivery overview.
//
// ⚠️ THE PALETTE CHANGED FOR A MEASURED REASON, NOT A TASTE ONE.
//
// The chart used to draw Succeeded in `ROLE.positive` (#52B788) against Failed
// in `BRAND.alert.error` (#E37D78). Run through the palette validator those two
// separate by ΔE 3.1 for a deuteranope — red against green is the classic
// colour-vision trap, and 3.1 is far below the ΔE 8 target. The two series whose
// distinction IS the entire point of the chart were nearly the same colour for
// a reader with the most common form of CVD.
//
// Swapping the soft red for `errorText` (#B23A33) — a token the design system
// already ships — takes the pair to ΔE 18.0 and passes every check: lightness
// band, chroma floor, CVD separation, normal-vision floor. It keeps the
// green/red semantics everyone reads instantly; what changes is that the red is
// dark enough to separate by lightness as well as hue.
//
// The validator also WARNs that #52B788 sits under 3:1 against the surface,
// which obligates visible labels rather than colour alone. That is what the
// end-of-line direct labels below are for — they are not decoration.
//
// THE FRAME, NOT THE LINE, IS WHAT LOOKED DATED
//
// Same conclusion the Jobs chart reached (see JobsTimeseriesChart: "el marco era
// el problema, no la barra"), applied to the line shape it never got: no
// CartesianGrid, no Y axis. A dashed grid and a numeric axis took more ink than
// the two lines they framed. Exact counts live in the tooltip and at the end of
// each line, which is where a reader actually looks for them.

import * as React from "react";
import { Box, Stack, Typography } from "@mui/material";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
} from "recharts";

import { BRAND, ROLE, TEXT } from "../../theme/brand";

/**
 * Succeeded / Failed, validated as a pair.
 *
 * Kept together and named so the next person changing one of them sees that
 * they are a validated pair, not two independent colour choices.
 */
const SERIES = [
  { key: "succeeded", name: "Succeeded", color: ROLE.positive },
  // Not ROLE.critical (#E37D78): too light to separate from the green under
  // deuteranopia. See the header.
  { key: "failed", name: "Failed", color: BRAND.alert.errorText },
];

/**
 * The value at the end of a line, drawn once.
 *
 * Direct labels are what let identity survive without reading colour, which the
 * contrast WARN on the green makes mandatory rather than optional. Only the
 * final point is labelled — a number on every point is noise, not information.
 *
 * ⚠️ Recharts clones a custom `label` once PER POINT, handing it
 * `{ x, y, value, index }`. An earlier version of this took a `points` array
 * and silently rendered nothing at all: the chart looked finished and had no
 * labels. Hence the index check, and hence the test that counts them.
 */
function endLabelRenderer({ color, name, lastIndex }) {
  return function EndLabel(props) {
    const { x, y, value, index } = props;
    if (index !== lastIndex || value == null) return null;
    return (
      <text
        x={x + 8}
        y={y}
        dy={4}
        fill={color}
        fontSize={TEXT.xs}
        fontWeight={700}
        // The tooltip and the legend carry the series name for assistive tech;
        // this is a visual reinforcement of what they already say.
        aria-hidden="true"
      >
        {value}
        <tspan fill={BRAND.gray} fontWeight={500}>{` ${name.toLowerCase()}`}</tspan>
      </text>
    );
  };
}

export function InstallsLegend() {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      {SERIES.map((s) => (
        <Stack key={s.key} direction="row" spacing={0.75} alignItems="center">
          <Box
            sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: s.color, flexShrink: 0 }}
          />
          {/* Text wears text tokens, never the series colour — the dot beside
              it is what carries identity. */}
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontWeight: 600 }}>
            {s.name}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export default function InstallsOverTimeChart({ data }) {
  return (
    <Box sx={{ height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        {/* Right margin leaves room for the end labels; without it they clip. */}
        <LineChart data={data} margin={{ top: 8, right: 68, bottom: 0, left: 0 }}>
          {/* No CartesianGrid and no YAxis on purpose — see the header. */}
          <XAxis
            dataKey="day"
            tick={{ fill: BRAND.gray, fontSize: TEXT.xs }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <RechartsTooltip
            // The crosshair is the hover layer a line chart owes the reader:
            // it makes "which day am I on" answerable without a grid.
            cursor={{ stroke: BRAND.border, strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 8,
              border: `1px solid ${BRAND.border}`,
              fontSize: TEXT.sm,
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            }}
            labelStyle={{ color: BRAND.dark, fontWeight: 700 }}
          />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              // Straight segments, not a curve. These are daily counts: a
              // spline draws values between the points that nobody measured,
              // and with sparse days it turns a jump from 0 to 31 into a
              // gentle S that reads like a trend instead of a spike.
              type="linear"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              // 8px so the hit target is bigger than the 2px line.
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
              label={endLabelRenderer({
                color: s.color,
                name: s.name,
                lastIndex: (data?.length ?? 0) - 1,
              })}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
