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

function buildLabel(row) {
  const platform = row?.os_platform ?? row?.osPlatform ?? "";
  const version = row?.os_version ?? row?.osVersion ?? row?.os ?? "";

  const platformStr = String(platform).trim();
  const versionStr = String(version).trim();

  if (platformStr && versionStr) return `${platformStr} ${versionStr}`;
  return versionStr || platformStr || "Unknown";
}

function toChartData(osVersions) {
  if (!Array.isArray(osVersions)) return [];

  return osVersions
    .map((r) => ({
      label: buildLabel(r),
      hostCount: Number(r?.host_count ?? r?.hostCount ?? 0),
    }))
    .filter((x) => Number.isFinite(x.hostCount) && x.hostCount > 0)
    .sort((a, b) => b.hostCount - a.hostCount);
}

export default function OsVersionsBar({ osVersions }) {
  const data = toChartData(osVersions);

  const rowHeight = 42;
  const minHeight = 230;
  const chartHeight = Math.max(minHeight, data.length * rowHeight);

  // Colores como el mock (1ro más oscuro, resto claro)
  const COLOR_PRIMARY = "#0f6b72";
  const COLOR_SECONDARY = "#8eeef0";

  // Evita usar <Cell/> (en algunas versiones aparece como deprecated)
  const CustomBar = (props) => {
    const { x, y, width, height, index } = props;
    const fill = index === 0 ? COLOR_PRIMARY : COLOR_SECONDARY;
    return <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} />;
  };

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>OS Versions</Typography>

      <Box sx={{ height: chartHeight, minWidth: 520 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
            barCategoryGap={10}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={160}
              tick={{ fontSize: 12 }}
              tickFormatter={(v) =>
                String(v).length > 18 ? `${String(v).slice(0, 18)}…` : v
              }
            />
            <Tooltip
              formatter={(value) => [`${value}`, "Hosts"]}
              labelFormatter={(label) => `OS: ${label}`}
            />

            <Bar dataKey="hostCount" barSize={14} shape={<CustomBar />}>
              <LabelList dataKey="hostCount" position="right" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}