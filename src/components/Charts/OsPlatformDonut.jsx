import * as React from "react";
import { Paper, Typography, Box } from "@mui/material";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Label } from "recharts";
import { BRAND } from "../../theme/brand";
import { CHART_SERIES_WIDE } from "../../theme/chartPalette";

/**
 * Props:
 * - osPlatform: [{ os_platform: "Windows", host_count: "1" }, ...]
 */
export default function OsPlatformDonut({ osPlatform }) {
  const data = React.useMemo(() => {
    if (!Array.isArray(osPlatform)) return [];
    return osPlatform
      .map((row) => ({
        name: row?.os_platform ?? "Unknown",
        value: Number(row?.host_count ?? 0)
      }))
      .filter((x) => x.value > 0);
  }, [osPlatform]);

  const total = React.useMemo(() => data.reduce((sum, x) => sum + x.value, 0), [data]);
  const COLORS = CHART_SERIES_WIDE;

  return (
    <Paper sx={{ p: 2, borderRadius: 3, height: "100%" }}>
      <Typography sx={{ fontWeight: 600, mb: 1 }}>
        OS Platform
      </Typography>

      {/* Layout: donut a la izquierda, leyenda a la derecha */}
      <Box sx={{ display: "flex", alignItems: "center", height: 170 }}>
        {/* Donut */}
        <Box sx={{ flex: "0 0 120px", height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="62%"
                outerRadius="89%"
                paddingAngle={2}
                isAnimationActive={true}
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}

                {/* Centro del donut (correcto en Recharts) */}
                <Label
                  position="center"
                  content={() => {
                    return (
                      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                        <tspan x="50%" dy="-2" fontSize="18" fontWeight="800">
                          {total || "—"}
                        </tspan>
                        <tspan x="50%" dy="16" fontSize="12" fill={BRAND.tealText}>
                          hosts
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Box>

        {/* Leyenda manual (evita que Recharts la “rompa”) */}
        <Box sx={{ ml: 2, display: "flex", flexDirection: "column", gap: 0.75 }}>
          {data.map((d, idx) => (
            <Box key={d.name} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: COLORS[idx % COLORS.length]
                }}
              />
              <Typography variant="body2" sx={{ color: BRAND.dark }}>
                {d.name}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}
