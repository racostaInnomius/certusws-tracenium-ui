import * as React from "react";
import { Box, Typography } from "@mui/material";
import { CHART_SERIES } from "../../theme/chartPalette";
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
// Shared categorical ramp — see theme/chartPalette.
const BAR_COLORS = CHART_SERIES;

function BarShape(props) {
  const { x, y, width, height, index } = props;
  const fill = BAR_COLORS[index] || BAR_COLORS[BAR_COLORS.length - 1];
  return <rect x={x} y={y} width={width} height={height} rx={2} ry={2} fill={fill} />;
}

// Stable references hoisted out of render so recharts doesn't re-lay-out on
// every parent re-render (the dashboard polls frequently).
const CHART_MARGIN = { top: 8, right: 24, left: -12, bottom: 8 };
const Y_TICK = { fontSize: 12 };
const tooltipFormatter = (value) => [`${value}`, "Hosts"];
const tooltipLabelFormatter = (label) => `OS: ${label}`;

function OsVersionsBar({ osVersions }) {
  // Derivation memoized: without this the parent's poll ticks rebuild a fresh
  // array every render and recharts re-animates even when nothing changed.
  const data = React.useMemo(() => toChartData(osVersions), [osVersions]);

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
            margin={CHART_MARGIN}
            barCategoryGap={10}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={160} tick={Y_TICK} />
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

// Memoized: re-renders only when `osVersions` changes, not on every parent
// poll tick.
export default React.memo(OsVersionsBar);