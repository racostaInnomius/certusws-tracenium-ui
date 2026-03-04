import React from "react";
import { Box, Typography } from "@mui/material";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Legend,
  Tooltip,
  Cell,
} from "recharts";

const COLORS = [
  "#2F8F8A", "#113634", "#05B0FA", "#3DC2AE", "#B8F1FE",
  "#1C5950", "#8BE9FE", "#013146", "#3DC2C2", "#5DE0FD",
  "#277C6F", "#30D7FD", "#011219", "#8FEAF2", "#03CFFC",
  "#329F8F", "#02A9CF", "#1D5956", "#0284A2", "#025173",
  "#60CDBD", "#01667D", "#0372A1", "#C9EEE8", "#013A47",
  "#44DBE9", "#073B40", "#6DE3EE", "#113636", "#D6FAFC",
  "#001519", "#0C6169", "#BFF3F8", "#1C5959", "#3EC1BA",
  "#277C7C", "#E8FBFC", "#118792", "#05B0FA", "#32BFFB",
  "#0491CD", "#C9EEEC", "#1BD3E4", "#8CDBFD", "#061313",
  "#5FCDFC", "#ECF9F7", "#16ADBB", "#B9E9FE", "#ECF9F8",
  "#329F9F", "#E6F7FE", "#45B0B0", "#143333", "#ABDEDE",
];

function normalizeVendors(printersByVendor) {
  const rows = Array.isArray(printersByVendor) ? printersByVendor : [];

  return rows
    .map((r) => {
      const name = (r?.vendor ?? "Unknown") || "Unknown";
      const value = Number(r?.printer_count ?? r?.count ?? 0) || 0;
      return { name, value };
    })
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

export default function PrintersByVendorPie({ printersByVendor }) {
  const data = normalizeVendors(printersByVendor);

  // Altura garantizada para que Recharts no quede en width/height -1
  return (
    <Box sx={{ height: "100%", minHeight: 220, display: "flex", flexDirection: "column" }}>
      <Typography sx={{ fontWeight: 600, mb: 1 }}>
        Printers by Vendor
      </Typography>

      <Box sx={{ flex: 1, minHeight: 180 }}>
        {data.length === 0 ? (
          <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: "text.secondary" }}>
            No data
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip />
              <Legend
                verticalAlign="middle"
                align="right"
                layout="vertical"
                iconType="circle"
                formatter={(value, entry, index) => (
                    <span style={{ 
                    color: "black", 
                    fontWeight: 500 
                    }}>
                    {value}
                    </span>
                )}
              />

              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="0%"
                outerRadius="89%"
                paddingAngle={0}
                stroke="transparent"
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}