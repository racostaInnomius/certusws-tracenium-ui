// src/components/AssetManagement/FleetCompositionDonut.jsx
//
// De qué está hecha la flota — una dona.
//
// ⚠️ Es la ÚNICA gráfica de esta página que de verdad reparte un todo: cuatro
// categorías que suman los equipos del tenant. Por eso es la única que merece
// forma circular; un pie con muchas rebanadas o con tamaños parecidos es
// ilegible, y 26/15/11/1 se lee de un golpe.
//
// Y por eso está EN MEDIO de los dos histogramas: separa dos gráficas de
// columnas que juntas se leían como una sola con un hueco en medio.
//
// ⚠️ Los equipos virtuales van al CENTRO, no al anillo. `formFactor` e
// `isVirtual` son ejes independientes (ver device-form-factor.ts): en esta
// flota los 11 virtuales SON los 11 servidores, así que como rebanada la dona
// sumaría 64 sobre 53 equipos. En el centro son lo que son — una lectura que
// atraviesa las cuatro categorías.
//
// SVG a mano y no Recharts a propósito: son cuatro arcos, y el chunk
// charts-vendor pesa 394 KB. Con el portal en SKU Free, cada chunk extra es
// otra oportunidad de sacar uno lento (ver CLAUDE.md del repo).

import * as React from "react";
import { Box, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

const SEGMENTS = [
  { key: "laptop", label: "Laptops", color: BRAND.teal },
  { key: "desktop", label: "Desktops", color: BRAND.tealText },
  { key: "server", label: "Servers", color: BRAND.dark },
  { key: "unknown", label: "Unclassified", color: BRAND.gray },
];

const SIZE = 128;
const RADIUS = 48;
const STROKE = 22;
const CIRC = 2 * Math.PI * RADIUS;

export default function FleetCompositionDonut({ composition, total, activeFilter, onSelect }) {
  const slices = SEGMENTS.map((s) => ({ ...s, value: Number(composition?.[s.key] || 0) })).filter(
    (s) => s.value > 0
  );
  const sum = slices.reduce((acc, s) => acc + s.value, 0);
  const virtual = Number(composition?.virtual || 0);

  // Cada arco arranca donde terminó el anterior. -90° pone el primero arriba,
  // que es donde el ojo empieza a leer un círculo.
  //
  // Se acumula con reduce y no con una variable mutable: el compilador de
  // React prohíbe reasignar durante el render, y con razón — una variable de
  // módulo o de closure mutada aquí daría arcos distintos en el segundo
  // render con los mismos datos.
  const arcs = slices.reduce((acc, s) => {
    const len = sum > 0 ? (s.value / sum) * CIRC : 0;
    const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
    return [...acc, { ...s, len, end: start + len, rotation: -90 + (start / CIRC) * 360 }];
  }, []);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: "100%",
        minHeight: 260,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>
        Fleet composition
      </Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mb: 1 }}>
        What the fleet is made of
      </Typography>

      {sum === 0 ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>
            No devices to classify
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label={`${Number(total || sum)} devices: ${slices
                .map((s) => `${s.value} ${s.label.toLowerCase()}`)
                .join(", ")}`}
            >
              {arcs.map((a) => (
                <Tooltip key={a.key} title={`${a.label}: ${a.value}`}>
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={activeFilter === a.key ? STROKE + 4 : STROKE}
                    strokeDasharray={`${a.len} ${CIRC - a.len}`}
                    transform={`rotate(${a.rotation} ${SIZE / 2} ${SIZE / 2})`}
                    onClick={() => onSelect?.(a.key)}
                    style={{ cursor: "pointer", transition: "stroke-width 160ms ease" }}
                  />
                </Tooltip>
              ))}
              <text
                x={SIZE / 2}
                y={SIZE / 2}
                textAnchor="middle"
                fontSize="26"
                fontWeight="800"
                fill={BRAND.dark}
              >
                {Number(total || sum)}
              </text>
              {virtual > 0 ? (
                <text
                  x={SIZE / 2}
                  y={SIZE / 2 + 16}
                  textAnchor="middle"
                  fontSize="11"
                  fill={BRAND.tealText}
                  onClick={() => onSelect?.("virtual")}
                  style={{ cursor: "pointer", fontWeight: 700 }}
                >
                  {virtual} virtual
                </text>
              ) : null}
            </svg>
          </Box>

          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, rowGap: 0.5, mt: 1 }}>
            {slices.map((s) => (
              <Stack
                key={s.key}
                direction="row"
                spacing={0.5}
                alignItems="center"
                onClick={() => onSelect?.(s.key)}
                sx={{ cursor: "pointer" }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: s.color }} />
                <Typography
                  sx={{
                    fontSize: TEXT.xs,
                    fontWeight: activeFilter === s.key ? 800 : 600,
                    color: activeFilter === s.key ? BRAND.dark : "text.secondary",
                  }}
                >
                  {s.label} {s.value}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </>
      )}
    </Paper>
  );
}
