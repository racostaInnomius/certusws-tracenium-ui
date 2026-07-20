import * as React from "react";
import { Box, Typography } from "@mui/material";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";




function toChartData(topManufacturers) {
  if (!Array.isArray(topManufacturers)) return [];

  return topManufacturers
    .map((r) => ({
      manufacturer: (r?.manufacturer ?? "Unknown").toString(),
      hostCount: Number(r?.host_count ?? 0),
    }))
    .filter((x) => x.hostCount > 0)
    .sort((a, b) => b.hostCount - a.hostCount);
}

// Paleta inspirada en el mock: 1er lugar más oscuro, el resto más
// claro. Extraída del render (era una const local + `<BarShape />`
// interno) porque recharts recibía un component nuevo en cada render
// — eslint's `cannot-create-components-during-render` lo marcó.
// Evitamos `<Cell/>` (deprecated en recharts 3) pintando por índice
// con un shape custom estable.
const BAR_COLORS = ["#5A9F9F", "#3E7878", "#52B788", "#B9E3D0"];

function BarShape(props) {
  const { x, y, width, height, index } = props;
  const fill = BAR_COLORS[index] || BAR_COLORS[BAR_COLORS.length - 1];
  return <rect x={x} y={y} width={width} height={height} rx={2} ry={2} fill={fill} />;
}

// Stable references hoisted out of render (see OsVersionsBar for rationale).
const CHART_MARGIN = { top: 8, right: 34, left: -32, bottom: 8 };
const Y_TICK = { fontSize: 12 };
const tooltipFormatter = (value) => [`${value}`, "Hosts"];
const tooltipLabelFormatter = (label) => `Manufacturer: ${label}`;

function TopManufacturersBar({ topManufacturers }) {
  const data = React.useMemo(() => toChartData(topManufacturers), [topManufacturers]);

  // Si hay muchos items, el Paper padre puede usar overflow: auto.
  const rowHeight = 44;
  const minHeight = 210;
  const chartHeight = Math.max(minHeight, data.length * rowHeight);

  return (
    <Box sx={{ width: "100%" }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Top Manufacturer</Typography>

      {/* ResponsiveContainer requiere que este contenedor tenga altura */}
      <Box sx={{ height: chartHeight, width: "100%", minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={CHART_MARGIN}
            barCategoryGap={10}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="manufacturer"
              width={160}
              tick={Y_TICK}
            />
            <Tooltip
              formatter={tooltipFormatter}
              labelFormatter={tooltipLabelFormatter}
            />
            <Bar dataKey="hostCount" barSize={14} shape={<BarShape />}>
              <LabelList dataKey="hostCount" position="right" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}

export default React.memo(TopManufacturersBar);