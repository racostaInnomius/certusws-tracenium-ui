// src/components/AssetManagement/RankingDonut.jsx
//
// Un ranking con forma de dona: las primeras posiciones como rebanadas y el
// resto agrupado en "Others".
//
// ⚠️ El agrupado NO es decorativo. Un pie con las nueve marcas del tenant 111
// —donde Dell es el 58%— vuelve ilegibles las rebanadas pequeñas y obliga a ir
// a la leyenda, que es justo lo que un círculo debería evitar. Con cuatro
// rebanadas y una de resto se lee de un vistazo, y el ranking completo sigue
// disponible en "View all": lo que se agrupa es el DIBUJO, no el dato.
//
// SVG a mano por la misma razón que FleetCompositionDonut: son cinco arcos y
// el chunk charts-vendor pesa 394 KB.

import * as React from "react";
import { Box, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

const SIZE = 128;
const RADIUS = 48;
const STROKE = 22;
const CIRC = 2 * Math.PI * RADIUS;

/** Paleta de la marca, en orden de lectura. "Others" siempre en gris. */
const SLICE_COLORS = [BRAND.teal, BRAND.tealText, BRAND.dark, BRAND.cyan || BRAND.tealHover];
const OTHERS_COLOR = BRAND.gray;

export function buildDonutSlices(items, maxSlices = 4) {
  const lista = (Array.isArray(items) ? items : [])
    .map((i) => ({ label: String(i?.label ?? "Unknown"), value: Number(i?.value || 0) }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  if (lista.length <= maxSlices + 1) {
    // Con una sola de resto no se agrupa: "Others: 3" dice menos que el nombre
    // de esa marca, y esconde un dato por nada.
    return lista.map((i, idx) => ({ ...i, color: SLICE_COLORS[idx % SLICE_COLORS.length] }));
  }

  const top = lista.slice(0, maxSlices).map((i, idx) => ({ ...i, color: SLICE_COLORS[idx % SLICE_COLORS.length] }));
  const resto = lista.slice(maxSlices);
  return [
    ...top,
    {
      label: "Others",
      value: resto.reduce((a, b) => a + b.value, 0),
      color: OTHERS_COLOR,
      othersCount: resto.length,
    },
  ];
}

export default function RankingDonut({ title, subtitle, items, totalLabel, emptyLabel, headerExtra }) {
  const slices = buildDonutSlices(items);
  const sum = slices.reduce((a, s) => a + s.value, 0);

  const arcs = slices.reduce((acc, s) => {
    const len = sum > 0 ? (s.value / sum) * CIRC : 0;
    const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
    return [...acc, { ...s, len, end: start + len, rotation: -90 + (start / CIRC) * 360 }];
  }, []);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2, height: "100%", minHeight: 260, borderRadius: 3,
        border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow,
        display: "flex", flexDirection: "column",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>{title}</Typography>
          {subtitle ? (
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{subtitle}</Typography>
          ) : null}
        </Box>
        {headerExtra}
      </Stack>

      {sum === 0 ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>{emptyLabel}</Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg
              width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
              aria-label={slices.map((s) => `${s.label}: ${s.value}`).join(", ")}
            >
              {arcs.map((a) => (
                <Tooltip
                  key={a.label}
                  title={a.othersCount ? `${a.othersCount} more · ${a.value}` : `${a.label}: ${a.value}`}
                >
                  <circle
                    cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none"
                    stroke={a.color} strokeWidth={STROKE}
                    strokeDasharray={`${a.len} ${CIRC - a.len}`}
                    transform={`rotate(${a.rotation} ${SIZE / 2} ${SIZE / 2})`}
                  />
                </Tooltip>
              ))}
              <text x={SIZE / 2} y={SIZE / 2 + 5} textAnchor="middle" fontSize="24" fontWeight="800" fill={BRAND.dark}>
                {sum}
              </text>
            </svg>
          </Box>

          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, rowGap: 0.5, mt: 1 }}>
            {slices.map((s) => (
              <Stack key={s.label} direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: s.color }} />
                <Typography sx={{ fontSize: TEXT.xs, fontWeight: 600, color: "text.secondary" }}>
                  {s.label} {s.value}
                </Typography>
              </Stack>
            ))}
          </Stack>
          {totalLabel ? (
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 0.5 }}>{totalLabel}</Typography>
          ) : null}
        </>
      )}
    </Paper>
  );
}
