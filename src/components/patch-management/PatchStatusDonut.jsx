// src/components/patch-management/PatchStatusDonut.jsx
//
// «How much of the fleet is up to date on OS patches?» — the Status column of
// the devices table, counted, next to the Start here queue (where there was
// empty space).
//
// ⚠️ EL TÍTULO DICE «OS»: lo que cuenta esta columna son parches del SISTEMA
// OPERATIVO (Windows Update, apt/dnf, softwareupdate), no las aplicaciones de
// terceros — ésas viven en Vulnerabilities y en Software. Un «Fleet patch
// status» a secas prometía más de lo que mide.
//
// Cada banda filtra la tabla de equipos, y comparte estado con las tarjetas de
// «Fleet totals»: una sola dimensión de filtro y un solo chip.
//
// ⚠️ COLOUR IS THE SECOND ENCODING, NEVER THE FIRST. Every band is named with
// its count in the legend, so the donut is readable without distinguishing the
// hues. The critical fill is `errorText` (#B23A33) rather than the soft red for
// the reason InstallsOverTimeChart documents: soft red against the positive
// green separates by ΔE 3.1 for a deuteranope, which is no separation at all.

import * as React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { Cell, Pie, PieChart } from "recharts";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { patchStatusChartData } from "./patchStatusChart";

const FILL = {
  positive: ROLE.positive,
  caution: ROLE.caution,
  critical: BRAND.alert.errorText,
  info: BRAND.teal,
  muted: BRAND.gray,
};

export default function PatchStatusDonut({ statusBreakdown, size = 148, selectedStatus = null, onSelectStatus }) {
  const data = React.useMemo(() => patchStatusChartData(statusBreakdown), [statusBreakdown]);

  if (data.reporting === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>OS patch status</Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5 }}>
          No device has reported its patch status yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark, mb: 0.25 }}>
        OS patch status
      </Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mb: 1 }}>
        Operating-system updates · select a band to filter the devices table
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
          <PieChart width={size} height={size}>
            <Pie
              data={data.segments}
              dataKey="value"
              nameKey="label"
              innerRadius={size * 0.32}
              outerRadius={size * 0.48}
              paddingAngle={1}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              stroke={BRAND.surface}
            >
              {data.segments.map((s) => (
                <Cell
                  key={s.key}
                  fill={FILL[s.tone] ?? BRAND.gray}
                  // Una banda seleccionada se distingue por BORDE, no sólo por
                  // opacidad: el color ya carga el significado de la banda.
                  stroke={selectedStatus === s.key ? BRAND.dark : BRAND.surface}
                  strokeWidth={selectedStatus === s.key ? 2 : 1}
                  opacity={selectedStatus && selectedStatus !== s.key ? 0.45 : 1}
                  cursor={onSelectStatus ? "pointer" : undefined}
                  onClick={onSelectStatus ? () => onSelectStatus(s.key) : undefined}
                />
              ))}
            </Pie>
          </PieChart>
          {/* El dato que se busca, en el centro y en palabras. */}
          <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark, lineHeight: 1 }}>
              {data.patchedPct}%
            </Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>fully patched</Typography>
          </Box>
        </Box>

        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, minWidth: 150 }}>
          {data.segments.map((s) => (
            <Box component="li" key={s.key}>
              {/* La leyenda es el objetivo de click ACCESIBLE: un botón con
                  nombre y estado, no un trozo de donut sin etiqueta. */}
              <Box
                component="button"
                type="button"
                onClick={() => onSelectStatus?.(s.key)}
                disabled={!onSelectStatus}
                aria-pressed={selectedStatus === s.key}
                sx={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 0.75,
                  py: 0.4,
                  border: "none",
                  borderRadius: 1,
                  bgcolor: selectedStatus === s.key ? BRAND.tealSoft : "transparent",
                  cursor: onSelectStatus ? "pointer" : "default",
                  textAlign: "left",
                  font: "inherit",
                  "&:hover": onSelectStatus ? { bgcolor: BRAND.darkSoft } : undefined,
                }}
              >
                <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: FILL[s.tone] ?? BRAND.gray, flexShrink: 0 }} />
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, flex: 1 }}>{s.label}</Typography>
                <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{s.value}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Stack>

      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 1 }}>
        {data.patched} of {data.reporting} reporting devices
        {data.notKnown > 0 ? (
          <Tooltip
            arrow
            placement="top"
            title="A failed scan arrives with no pending patches, and an inventory-only device never ran one. Neither is evidence the device is patched."
          >
            <Box component="span" sx={{ cursor: "help", borderBottom: `1px dotted ${BRAND.gray}`, ml: 0.5 }}>
              · {data.notKnown} not known to be patched
            </Box>
          </Tooltip>
        ) : null}
      </Typography>
    </Box>
  );
}
