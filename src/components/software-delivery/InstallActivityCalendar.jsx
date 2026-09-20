// src/components/software-delivery/InstallActivityCalendar.jsx
//
// Cuándo se instaló qué, en forma de calendario.
//
// ── Qué sustituye, y por qué ─────────────────────────────────────────────
//
// Aquí vivían DOS representaciones y un selector (`shouldUseStrip`): barras
// para cuando hay densidad, marcas sueltas para cuando no. Las dos eran
// correctas y ninguna resolvía el problema real de la página — que a volumen
// bajo, que es el normal en entrega de software, un panel de 220 px de alto
// contenía tres marcas y mucho aire. En T111: 25 instalaciones repartidas en 9
// días de los últimos 90.
//
// Un calendario no tiene ese problema porque su fondo ES la ventana: los 81
// días sin nada no son hueco desaprovechado, son la respuesta a «¿con qué
// frecuencia entregamos?». Y funciona igual de bien con densidad, que es lo que
// permite dejar UNA sola representación en vez de dos y un selector.
//
// ⚠️ NO INTERPOLA, que era la objeción de fondo contra la línea: cada día es
// su propia celda. Dos instalaciones separadas por tres semanas se ven
// separadas por tres semanas de celdas vacías.
//
// ── Decisiones de color ──────────────────────────────────────────────────
//
// ⚠️ UN DÍA CON FALLOS SE PINTA DE ROJO AUNQUE TENGA ÉXITOS. La pregunta que
// trae a alguien a esta gráfica es «¿algo va mal?», y mezclar los dos colores
// en una celda de 12 px produce un tono intermedio que no es ni una cosa ni la
// otra. El recuento exacto está en el tooltip y en los totales de abajo.
//
// La intensidad del verde es relativa al DÍA MÁS CARGADO de la ventana, no a
// una escala fija: una flota que instala 3 al día y otra que instala 300 tienen
// la misma pregunta («¿cuál fue el día fuerte?») y la misma gráfica la
// contesta.

import * as React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";

import { BRAND, ROLE, TEXT } from "../../theme/brand";

const CELL = 13;
const GAP = 3;
const DAYS_PER_WEEK = 7;

/**
 * Los días de la ventana en columnas de siete, más los totales.
 *
 * Puro: es donde se decide qué celda es qué día, y un desfase de un día aquí
 * no da error — sólo cuenta una historia que no pasó.
 */
export function calendarWeeks(buckets) {
  const rows = (Array.isArray(buckets) ? buckets : []).map((b) => ({
    day: String(b?.bucket ?? b?.day ?? ""),
    succeeded: Number(b?.succeeded ?? 0),
    failed: Number(b?.failed ?? 0),
  }));

  const weeks = [];
  for (let i = 0; i < rows.length; i += DAYS_PER_WEEK) {
    weeks.push(rows.slice(i, i + DAYS_PER_WEEK));
  }

  const succeeded = rows.reduce((n, r) => n + r.succeeded, 0);
  const failed = rows.reduce((n, r) => n + r.failed, 0);
  const peak = rows.reduce((m, r) => Math.max(m, r.succeeded + r.failed), 0);
  const activeDays = rows.filter((r) => r.succeeded > 0 || r.failed > 0).length;

  return { weeks, succeeded, failed, total: succeeded + failed, peak, activeDays, days: rows.length };
}

/**
 * El color de una celda: rojo si hubo algún fallo, verde por intensidad si no.
 *
 * `peak` es el día más cargado de ESTA ventana; con 0 no hay nada que escalar.
 */
export function cellTone(day, peak) {
  const failed = Number(day?.failed ?? 0);
  const ok = Number(day?.succeeded ?? 0);
  if (failed > 0) return { color: ROLE.critical, level: 4 };
  if (ok === 0) return { color: BRAND.surfaceMuted, level: 0 };
  // Cuatro escalones: más se vuelven indistinguibles a 13 px.
  const share = peak > 0 ? ok / peak : 1;
  const level = share > 0.66 ? 3 : share > 0.33 ? 2 : 1;
  const alpha = { 1: 0.35, 2: 0.6, 3: 1 }[level];
  return { color: `rgba(82,183,136,${alpha})`, level };
}

function dayLabel(day) {
  const failed = Number(day?.failed ?? 0);
  const ok = Number(day?.succeeded ?? 0);
  if (!day?.day) return "";
  if (ok === 0 && failed === 0) return `${day.day} · nothing installed`;
  const parts = [];
  if (ok) parts.push(`${ok} succeeded`);
  if (failed) parts.push(`${failed} failed`);
  return `${day.day} · ${parts.join(" · ")}`;
}

export default function InstallActivityCalendar({ buckets }) {
  const { weeks, succeeded, failed, total, peak, activeDays, days } = React.useMemo(
    () => calendarWeeks(buckets),
    [buckets]
  );

  const first = weeks[0]?.[0]?.day ?? "";
  const lastWeek = weeks[weeks.length - 1] ?? [];
  const last = lastWeek[lastWeek.length - 1]?.day ?? "";

  return (
    <Box>
      <Box
        role="img"
        aria-label={
          total > 0
            ? `Install activity: ${total} installs across ${activeDays} of ${days} days`
            : `Install activity: nothing installed in the last ${days} days`
        }
        sx={{ display: "flex", gap: `${GAP}px`, flexWrap: "wrap" }}
      >
        {weeks.map((week, wi) => (
          <Box key={wi} sx={{ display: "grid", gridAutoFlow: "row", gap: `${GAP}px` }}>
            {week.map((day) => {
              const tone = cellTone(day, peak);
              return (
                <Tooltip key={day.day} title={dayLabel(day)}>
                  <Box
                    sx={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 0.5,
                      bgcolor: tone.color,
                      // El borde sólo en las vacías: sin él, una ventana sin
                      // actividad es un rectángulo liso y no se lee como
                      // calendario.
                      border: tone.level === 0 ? `1px solid ${BRAND.border}` : "none",
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
        ))}
      </Box>

      <Stack
        direction="row"
        justifyContent="space-between"
        sx={{ mt: 0.75, maxWidth: weeks.length * (CELL + GAP) }}
      >
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{first}</Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{last}</Typography>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 0.5 }}>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
          <strong>{total}</strong> install{total === 1 ? "" : "s"}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.successText }}>
          <strong>{succeeded}</strong> succeeded
        </Typography>
        {/* El cero de fallos NO se pinta en rojo: «0 failed» en rojo se lee
            como una alarma al ojo que sólo ve el color. */}
        <Typography
          sx={{ fontSize: TEXT.sm, color: failed > 0 ? BRAND.alert.errorText : BRAND.gray }}
        >
          <strong>{failed}</strong> failed
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>Less</Typography>
          {[0, 1, 2, 3].map((level) => (
            <Box
              key={level}
              sx={{
                width: 10,
                height: 10,
                borderRadius: 0.5,
                bgcolor:
                  level === 0 ? BRAND.surfaceMuted : `rgba(82,183,136,${{ 1: 0.35, 2: 0.6, 3: 1 }[level]})`,
                border: level === 0 ? `1px solid ${BRAND.border}` : "none",
              }}
            />
          ))}
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>More</Typography>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: ROLE.critical, ml: 1 }} />
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>Day with failures</Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
