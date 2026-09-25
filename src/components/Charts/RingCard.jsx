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
  snapDelta,
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

/**
 * Pega la dona a la rejilla de píxeles del dispositivo. Ver `snapDelta`.
 *
 * Es un efecto de LAYOUT y no de render: mide después de colocar y antes de
 * pintar, así el ajuste no se ve entrar. El desplazamiento se guarda en una
 * ref además del estado para poder descontarlo en la siguiente medición — sin
 * eso, cada pasada mediría la posición YA corregida y el valor se perseguiría
 * a sí mismo.
 */
function usePixelSnap() {
  const ref = React.useRef(null);
  const aplicado = React.useRef({ x: 0, y: 0 });
  const [ajuste, setAjuste] = React.useState({ x: 0, y: 0 });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.getBoundingClientRect !== "function") return undefined;

    const medir = () => {
      const r = el.getBoundingClientRect();
      // jsdom y un nodo aún sin colocar dan ceros: no hay nada que ajustar.
      if (!r.width && !r.height) return;
      const dpr = window.devicePixelRatio || 1;
      const x = snapDelta(r.left - aplicado.current.x, dpr);
      const y = snapDelta(r.top - aplicado.current.y, dpr);
      if (Math.abs(x - aplicado.current.x) < 0.01 && Math.abs(y - aplicado.current.y) < 0.01) return;
      aplicado.current = { x, y };
      setAjuste({ x, y });
    };

    medir();
    const observado = el.parentElement ?? el;
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    ro?.observe(observado);
    window.addEventListener("resize", medir);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  return { ref, transform: `translate(${ajuste.x}px, ${ajuste.y}px)` };
}

/** Tope del anillo con la leyenda al lado: cabe en la altura de la card. */
const SIDE_RING_MAX = 200;

/** El punto de color de la leyenda; rayado para la rebanada `pending`. */
function LegendDot({ slice }) {
  return (
    <Box
      sx={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        flexShrink: 0,
        ...(slice.pending
          ? {
              background: `repeating-linear-gradient(45deg, ${PENDING_COLOR}, ${PENDING_COLOR} 1.5px, transparent 1.5px, transparent 3px)`,
              border: `1px solid ${PENDING_COLOR}`,
            }
          : { bgcolor: slice.color }),
      }}
    />
  );
}

function Centered({ children, order = 0 }) {
  return (
    <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: SIZE, minWidth: 0, order }}>
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
  /**
   * "bottom" (por defecto): la leyenda en fichas bajo el anillo.
   * "side": lista vertical a la IZQUIERDA con la cifra alineada, y el anillo
   * crece para ocupar el resto. Sólo para cards anchas — en el Dashboard de
   * Assets (383 px) el anillo pasa de 144 a ~200 px; en una de 284 px
   * (Hardware Inventory) ENCOGERÍA, por eso no es el defecto (maqueta del
   * 25-sep, decidido con el owner).
   */
  legendPlacement = "bottom",
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
  const { ref: snapRef, transform: snapTransform } = usePixelSnap();
  const side = legendPlacement === "side";

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
        // Con la leyenda al lado, fila: la leyenda va primero (order) y el
        // anillo ocupa lo que queda. Abajo, `contents` deja los hijos como
        // estaban, en la columna de la card.
        <Box
          data-legend={side ? "side" : "bottom"}
          sx={side ? { flex: 1, display: "flex", alignItems: "center", gap: 2, minHeight: 0, mt: 0.5 } : { display: "contents" }}
        >
          <Centered order={side ? 1 : 0}>
            <svg
              ref={snapRef}
              // Al lado, el SVG escala con su viewBox hasta SIDE_RING_MAX.
              width={side ? "100%" : SIZE}
              height={side ? undefined : SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              // Precisión antes que velocidad: son cuatro arcos, y el borde de
              // un trazo de 22 px es justo lo que se mira.
              shapeRendering="geometricPrecision"
              style={side ? { transform: snapTransform, maxWidth: SIDE_RING_MAX, height: "auto" } : { transform: snapTransform }}
              role="img"
              aria-label={`${shownTotal} ${ariaNoun}: ${visible
                .map((s) => `${s.value} ${String(s.label).toLowerCase()}`)
                .join(", ")}`}
            >
              <defs>
                {/* ⚠️ Región explícita, en el marco del SVG. Por defecto la
                    máscara mide el 120% de la caja del <g>, y esa caja se
                    calcula SIN el trazo: radio 48 → 57,6 px de región contra
                    59 px de anillo (61 activo). Eso era el "cortado" en los
                    cuatro lados, y por eso agrandar el viewBox no lo arregló. */}
                <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={SIZE} height={SIZE}>
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

          {side ? (
            <Stack spacing={0.75} sx={{ order: 0, flex: "0 1 auto", minWidth: 0, maxWidth: "50%" }}>
              {visible.map((s) => {
                const onClick = sliceHandler(s);
                const active = activeKey === s.key;
                return (
                  <Box
                    key={s.key}
                    onClick={onClick}
                    role={onClick ? "button" : undefined}
                    tabIndex={onClick ? 0 : undefined}
                    aria-pressed={onClick ? active : undefined}
                    onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " " ? onClick(e) : null) : undefined}
                    title={`${s.label}: ${s.pending ? "+" : ""}${s.value}`}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "8px minmax(0, 1fr) auto",
                      alignItems: "center",
                      columnGap: 1,
                      px: 0.5,
                      mx: -0.5,
                      py: 0.25,
                      borderRadius: 1,
                      cursor: onClick ? "pointer" : "default",
                      bgcolor: active ? BRAND.tealSoft : "transparent",
                      "&:hover": onClick ? { bgcolor: BRAND.tealSoft } : undefined,
                      "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 1 },
                    }}
                  >
                    <LegendDot slice={s} />
                    <Typography
                      noWrap
                      sx={{
                        fontSize: TEXT.sm,
                        fontWeight: active ? 800 : 500,
                        fontStyle: s.pending ? "italic" : "normal",
                        color: active ? BRAND.dark : "text.secondary",
                      }}
                    >
                      {s.label}
                    </Typography>
                    <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: BRAND.dark, pl: 1, textAlign: "right" }}>
                      {`${s.pending ? "+" : ""}${s.value}`}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          ) : (
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
                  <LegendDot slice={s} />
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
          )}
        </Box>
      )}
    </Paper>
  );
}
