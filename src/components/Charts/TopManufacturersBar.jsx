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
  Rectangle,
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

export default function TopManufacturersBar({ topManufacturers }) {
  const data = toChartData(topManufacturers);

  // Colores como tu referencia:
  // - Top 1 un poco más oscuro
  // - Resto más claro
  const COLOR_TOP_1 = "#4FAFAF";
  const COLOR_OTHERS = "#74EEF0";

  // Custom shape para colorear por índice (sin usar <Cell />)
  const CustomBar = (props) => {
    const { index } = props; // Recharts pasa index
    const fill = index === 0 ? COLOR_TOP_1 : COLOR_OTHERS;

    return (
      <Rectangle
        {...props}
        fill={fill}
        radius={[3, 3, 3, 3]} // bordes redondeados suaves
      />
    );
  };

  // Si hay muchos items, el contenedor padre hará scroll (lo vamos a poner en Paper con overflow)
  const rowHeight = 44;
  const minHeight = 220;
  const chartHeight = Math.max(minHeight, data.length * rowHeight);

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Top Manufacturer</Typography>

      <Box sx={{ height: chartHeight, minWidth: 460 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
            barCategoryGap={11} // más aire entre barras (como mock)
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="manufacturer"
              width={160}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value) => [`${value}`, "Hosts"]}
              labelFormatter={(label) => `Manufacturer: ${label}`}
            />

            <Bar
              dataKey="hostCount"
              barSize={12} // barras más delgadas
              shape={<CustomBar />}
              isAnimationActive={false}
            >
              <LabelList dataKey="hostCount" position="right" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}