// src/components/Charts/RingCard.jsx
//
// La card de dona que comparten Fleet composition, Agent versions, OS platform
// y OS patch recency.
//
// ⭐ Nació del layout de Fleet composition (Hardware Inventory): anillo grueso
// sin separaciones, la cifra grande en el centro y la leyenda en fichas que se
// envuelven debajo. Las otras tres usaban una dona de Recharts con cuñas
// separadas, una cifra de 16 px y una lista vertical — dos idiomas para la
// misma pregunta ("¿de qué está hecho este total?"), uno al lado del otro en la
// misma fila del Overview.
//
// ⚠️ La card NO elige colores: cada rebanada trae el suyo. Agent versions y OS
// patch recency hablan en ROLE (bien / atención / crítico) y OS platform en el
// color canónico de cada plataforma; homologar el layout no puede aplanar eso.
//
// ⚠️ Una rebanada `pending` (equipos del roster que la fuente de esta dona aún
// no tiene) se dibuja en gris neutro y con "+N" y ficha rayada en la leyenda:
// el total la incluye, pero no es un dato medido, y no navega porque no existe
// ese filtro en las páginas de destino. (Llevó también un anillo punteado
// alrededor de la dona; se quitó a petición del owner — la leyenda basta.)
//
// SVG a mano y no Recharts a propósito: son pocos arcos, y el chunk
// charts-vendor pesa 394 KB. Con el portal en SKU Free, cada chunk extra es
// otra oportunidad de sacar uno lento (ver CLAUDE.md del repo).

import * as React from "react";
import { Box, GlobalStyles, Paper, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import {
  PENDING_COLOR,
  RING_CIRCUMFERENCE,
  RING_RADIUS as RADIUS,
  RING_SIZE as SIZE,
  RING_STROKE as STROKE,
  ringArcs,
} from "./ringGeometry";

// ⭐ La entrada: el anillo se descubre en sentido horario desde arriba, como
// hacía la dona de Recharts antes de homologar el layout (se perdió con el
// cambio y se echó en falta). No se animan los arcos uno a uno: una máscara
// con un único trazo blanco barre la circunferencia y va destapando las
// rebanadas ya colocadas, así la geometría que prueban los tests no cambia.
// Recharts usaba 1500 ms "ease"; se conserva.
const SWEEP_STYLES = {
  "@keyframes ringCardSweep": {
    from: { strokeDashoffset: RING_CIRCUMFERENCE },
    to: { strokeDashoffset: 0 },
  },
  ".ring-card-sweep": { animation: "ringCardSweep 1500ms ease both" },
  "@media (prefers-reduced-motion: reduce)": { ".ring-card-sweep": { animation: "none" } },
};

function Centered({ children }) {
  return (
    <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: SIZE }}>
      {children}
    </Box>
  );
}

/**
 * @param slices      [{ key, label, value, color, pending? }] — las de valor 0 no se dibujan.
 * @param total       cifra del centro; por defecto la suma de las rebanadas.
 * @param centerLabel texto bajo la cifra ("enrolled", "11 virtual"…).
 * @param onCenterLabelClick hace pulsable ese texto (p. ej. filtrar virtuales).
 * @param activeKey   rebanada resaltada (filtro aplicado).
 * @param onSliceClick recibe la rebanada; nunca se llama para una `pending`.
 * @param onCardClick la card entera navega sin filtro.
 */
export default function RingCard({
  title,
  subtitle = null,
  slices,
  total = null,
  centerLabel = null,
  centerLabelColor = null,
  onCenterLabelClick = null,
  activeKey = null,
  onSliceClick = null,
  onCardClick = null,
  loading = false,
  emptyLabel = "No data",
  ariaNoun = "items",
  sx = null,
}) {
  const visible = (slices || []).filter((s) => Number(s.value) > 0);
  const sum = visible.reduce((acc, s) => acc + s.value, 0);
  const arcs = ringArcs(visible);
  const shownTotal = total ?? sum;
  const cardInteractive = typeof onCardClick === "function";
  // useId trae ":" y en `url(#…)` no todos los navegadores lo aceptan.
  const maskId = `ring-sweep-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // Cambian los datos → se vuelve a barrer, como hacía Recharts. Remontar
  // sólo el trazo de la máscara basta para reiniciar la animación.
  const sweepKey = visible.map((v) => `${v.key}:${v.value}`).join("|");

  // stopPropagation: pulsar una rebanada no debe disparar también la
  // navegación sin filtro de la card, que perdería el filtro.
  const sliceHandler = (s) =>
    !s.pending && typeof onSliceClick === "function"
      ? (e) => {
          e.stopPropagation();
          onSliceClick(s);
        }
      : undefined;

  return (
    <Paper
      elevation={0}
      onClick={cardInteractive ? onCardClick : undefined}
      sx={{
        p: 2,
        height: "100%",
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        flexDirection: "column",
        cursor: cardInteractive ? "pointer" : "default",
        transition: "border-color 120ms ease",
        "&:hover": cardInteractive ? { borderColor: BRAND.teal } : undefined,
        ...(sx || {}),
      }}
    >
      <GlobalStyles styles={SWEEP_STYLES} />
      <Typography component="div" sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography component="div" sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
          {subtitle}
        </Typography>
      ) : null}

      {/* Mientras carga, esqueleto: sin él la card afirmaba "sin datos"
          durante el primer segundo. */}
      {loading && sum === 0 ? (
        <Centered>
          <Skeleton variant="circular" width={SIZE - 8} height={SIZE - 8} />
        </Centered>
      ) : sum === 0 ? (
        <Centered>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>{emptyLabel}</Typography>
        </Centered>
      ) : (
        <>
          <Centered>
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label={`${shownTotal} ${ariaNoun}: ${visible
                .map((s) => `${s.value} ${String(s.label).toLowerCase()}`)
                .join(", ")}`}
            >
              <defs>
                <mask id={maskId}>
                  <circle
                    key={sweepKey}
                    className="ring-card-sweep"
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke="#fff"
                    // Más ancho que el trazo resaltado (STROKE + 4): la
                    // máscara no puede recortar la rebanada activa.
                    strokeWidth={STROKE + 10}
                    strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                    transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                  />
                </mask>
              </defs>
              <g mask={`url(#${maskId})`}>
              {arcs.map((a) => {
                const onClick = sliceHandler(a);
                return (
                  <Tooltip key={a.key} title={`${a.label}: ${a.pending ? "+" : ""}${a.value}`}>
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={a.color}
                      strokeWidth={activeKey === a.key ? STROKE + 4 : STROKE}
                      strokeDasharray={`${a.len} ${RING_CIRCUMFERENCE - a.len}`}
                      transform={`rotate(${a.rotation} ${SIZE / 2} ${SIZE / 2})`}
                      onClick={onClick}
                      data-ring="slice"
                      style={{ cursor: onClick ? "pointer" : "default", transition: "stroke-width 160ms ease" }}
                    />
                  </Tooltip>
                );
              })}
              </g>
              <text
                x={SIZE / 2}
                y={SIZE / 2 + (centerLabel ? 0 : 9)}
                textAnchor="middle"
                fontSize="26"
                fontWeight="800"
                fill={BRAND.dark}
              >
                {shownTotal}
              </text>
              {centerLabel ? (
                <text
                  x={SIZE / 2}
                  y={SIZE / 2 + 16}
                  textAnchor="middle"
                  fontSize="11"
                  fill={centerLabelColor || BRAND.gray}
                  onClick={
                    onCenterLabelClick
                      ? (e) => {
                          e.stopPropagation();
                          onCenterLabelClick();
                        }
                      : undefined
                  }
                  style={{
                    cursor: onCenterLabelClick ? "pointer" : "default",
                    fontWeight: onCenterLabelClick ? 700 : 500,
                  }}
                >
                  {centerLabel}
                </text>
              ) : null}
            </svg>
          </Centered>

          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, rowGap: 0.5, mt: 1 }}>
            {visible.map((s) => {
              const onClick = sliceHandler(s);
              const active = activeKey === s.key;
              return (
                <Stack
                  key={s.key}
                  direction="row"
                  spacing={0.5}
                  alignItems="center"
                  onClick={onClick}
                  sx={{ cursor: onClick ? "pointer" : "default", minWidth: 0 }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      flexShrink: 0,
                      ...(s.pending
                        ? {
                            background: `repeating-linear-gradient(45deg, ${PENDING_COLOR}, ${PENDING_COLOR} 1.5px, transparent 1.5px, transparent 3px)`,
                            border: `1px solid ${PENDING_COLOR}`,
                          }
                        : { bgcolor: s.color }),
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: TEXT.xs,
                      fontWeight: active ? 800 : 600,
                      fontStyle: s.pending ? "italic" : "normal",
                      color: active ? BRAND.dark : "text.secondary",
                    }}
                  >
                    {`${s.label} ${s.pending ? "+" : ""}${s.value}`}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        </>
      )}
    </Paper>
  );
}
