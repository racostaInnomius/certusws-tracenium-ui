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

export default function OsVersionsBar({ osVersions }) {
  const data = toChartData(osVersions);

  // 1er lugar más oscuro, el resto más claro.
  const barColors = ["#0c6e73", "#66e3f0", "#8feaf3", "#b9f3f7"];

  const BarShape = (props) => {
    const { x, y, width, height, index } = props;
    const fill = barColors[index] || barColors[barColors.length - 1];
    return <rect x={x} y={y} width={width} height={height} rx={2} ry={2} fill={fill} />;
  };

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