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




function toChartData(osVersions) {
  if (!Array.isArray(osVersions)) return [];

  return osVersions
    .map((r) => {
      const platform = (r?.os_platform ?? "Unknown").toString();
      const version = (r?.os_version ?? "Unknown").toString();
      return {
        label: `${platform} ${version}`,
        hostCount: Number(r?.host_count ?? 0),
      };
    })
    .filter((x) => x.hostCount > 0)
    .sort((a, b) => b.hostCount - a.hostCount);
}

// 1er lugar más oscuro, el resto más claro. Lifted out of the render
// function so recharts gets a stable `shape` reference — declaring a
// component inside the render body reinstantiates it every tick and
// eslint's `react-hooks/cannot-create-components-during-render` rule
// (correctly) flagged it.
const BAR_COLORS = ["#0c6e73", "#66e3f0", "#8feaf3", "#b9f3f7"];

function BarShape(props) {
  const { x, y, width, height, index } = props;
  const fill = BAR_COLORS[index] || BAR_COLORS[BAR_COLORS.length - 1];
  return <rect x={x} y={y} width={width} height={height} rx={2} ry={2} fill={fill} />;
}

export default function OsVersionsBar({ osVersions }) {
  const data = toChartData(osVersions);

  const rowHeight = 44;
  const minHeight = 220;
  const chartHeight = Math.max(minHeight, data.length * rowHeight);

  return (
    <Box sx={{ width: "100%" }}>
      <Typography sx={{ fontWeight: 600, mb: 1 }}>OS Versions</Typography>

      {/* ResponsiveContainer requiere que este contenedor tenga altura */}
      <Box sx={{ height: chartHeight, width: "100%", minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 24, left: -12, bottom: 8 }}
            barCategoryGap={10}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value) => [`${value}`, "Hosts"]}
              labelFormatter={(label) => `OS: ${label}`}
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