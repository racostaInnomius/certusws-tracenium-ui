// src/components/AssetManagement/DistributionHistogram.jsx
//
// Distribución de la flota en cubos — columnas verticales.
//
// ⚠️ Deliberadamente NO es CompositionBars. Toda la pantalla usaba el mismo
// ranking horizontal para cuatro preguntas distintas, y una distribución no es
// un ranking: importa la FORMA (dónde se acumula la flota, qué tan larga es la
// cola), no el orden. Un histograma se lee de izquierda a derecha con un eje
// que significa algo; una lista ordenada por tamaño pierde justo eso.
//
// Reemplaza dos tarjetas:
//
// - "Highest disk usage", que mostraba siempre los 8 equipos más llenos. Con
//   la flota sana enseñaba ocho aunque el mayor estuviera al 40% —alarma
//   fabricada— y con cinco críticos los mezclaba con tres sanos —alarma
//   diluida—. El histograma contesta la pregunta que de verdad se tiene:
//   además de los que ya cruzaron, ¿cuántos vienen detrás?
//
// - "Top CPU models", que con 24 modelos distintos en 53 equipos era cola
//   larga pura: el top-5 cubría una minoría y el resto quedaba invisible.
//
// Cada columna filtra la tabla. El cubo y su filtro salen de la misma
// definición en el backend, así que hacer clic en una barra de 5 muestra 5.

import * as React from "react";
import { Box, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

const CHART_HEIGHT = 96;

export default function DistributionHistogram({
  title,
  subtitle,
  buckets,
  activeFilter,
  onSelect,
  emptyLabel = "No data",
  /** Nota al pie para lo que no cabe en ningún cubo (equipos sin medir). */
  footnote,
  onFootnoteClick,
  /** Color de las columnas. Cada gráfico el suyo: todos en teal parecían el mismo. */
  color = BRAND.teal,
  /** Color del ÚLTIMO cubo (la cola), para que se lea como tal. */
  tailColor = null,
  /** Marca el cubo donde cae el equipo mediano (borde discontinuo). */
  markMedian = false,
}) {
  const rows = Array.isArray(buckets) ? buckets : [];
  const measured = rows.reduce((acc, b) => acc + Number(b?.count || 0), 0);
  // La columna más alta define la escala. Con `1` de piso, una flota con un
  // solo equipo no divide entre cero.
  const peak = Math.max(1, ...rows.map((b) => Number(b?.count || 0)));
  // El cubo del equipo mediano: donde la suma acumulada llega a la mitad. No
  // hacen falta los límites de cada cubo, sólo su orden.
  let acc = 0;
  const medianIndex =
    markMedian && measured > 0 ? rows.findIndex((b) => (acc += Number(b?.count || 0)) >= measured / 2) : -1;
  const clickable = typeof onSelect === "function";

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
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.25 }}>
        <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
          {measured} measured
        </Typography>
      </Stack>

      {subtitle ? (
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mb: 1 }}>
          {subtitle}
        </Typography>
      ) : null}

      {measured === 0 ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>{emptyLabel}</Typography>
        </Box>
      ) : (
        <Box
          sx={{
            mt: 1,
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${rows.length}, 1fr)`,
            alignItems: "end",
            gap: 0.75,
          }}
        >
          {rows.map((b, index) => {
            const count = Number(b?.count || 0);
            const active = activeFilter === b.key;
            const isTail = tailColor && index === rows.length - 1;
            const barColor = b.alarming ? ROLE.critical : isTail ? tailColor : color;
            const isMedian = index === medianIndex;

            return (
              <Tooltip
                key={b.key ?? b.label}
                title={`${count} device${count === 1 ? "" : "s"} · ${b.label}${isMedian ? " · holds the median" : ""}`}
              >
                <Box
                  // Sin `onSelect` la columna no hace nada: no se anuncia como botón.
                  {...(clickable
                    ? {
                        role: "button",
                        tabIndex: 0,
                        "aria-pressed": active,
                        onClick: () => onSelect(b.key),
                        onKeyDown: (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelect(b.key);
                          }
                        },
                      }
                    : {})}
                  aria-label={`${b.label}: ${count} devices${isMedian ? " (median)" : ""}`}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    height: "100%",
                    cursor: clickable ? "pointer" : "default",
                    borderRadius: 1.5,
                    p: 0.5,
                    bgcolor: active ? BRAND.tealSoft : "transparent",
                    "&:hover .bar": { opacity: 1 },
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: TEXT.xs,
                      fontWeight: 800,
                      textAlign: "center",
                      // Un cubo vacío se dibuja igual, con su 0: saltárselo
                      // rompería el eje y la distribución dejaría de leerse
                      // como una forma.
                      color: count === 0 ? "text.secondary" : BRAND.dark,
                      mb: 0.5,
                    }}
                  >
                    {count}
                  </Typography>

                  <Box
                    className="bar"
                    sx={{
                      // Altura proporcional, con 3px de piso para que un cubo
                      // con pocos equipos siga siendo visible y clicable.
                      height: count === 0 ? 2 : Math.max(3, (count / peak) * CHART_HEIGHT),
                      borderRadius: 1,
                      bgcolor: count === 0 ? BRAND.border : barColor,
                      opacity: active || isTail ? 1 : 0.85,
                      transition: "opacity 160ms ease",
                      outline: isMedian ? `2px dashed ${color}` : "none",
                      outlineOffset: 2,
                    }}
                  />

                  <Typography
                    sx={{
                      mt: 0.75,
                      fontSize: TEXT.xs,
                      textAlign: "center",
                      color: active ? BRAND.dark : "text.secondary",
                      fontWeight: active ? 800 : 600,
                      lineHeight: 1.2,
                    }}
                  >
                    {b.label}
                  </Typography>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      )}

      {/* Lo que no cabe en ningún cubo se dice, no se calla: un equipo sin
          medir no es un equipo con el disco vacío. */}
      {footnote ? (
        <Typography
          onClick={onFootnoteClick}
          sx={{
            mt: 1.25,
            fontSize: TEXT.xs,
            color: "text.secondary",
            cursor: onFootnoteClick ? "pointer" : "default",
            textDecoration: onFootnoteClick ? "underline dotted" : "none",
          }}
        >
          {footnote}
        </Typography>
      ) : null}
    </Paper>
  );
}
