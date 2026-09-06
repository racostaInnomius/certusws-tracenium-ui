// src/components/software-delivery/InstallDaysStrip.jsx
//
// Pocos eventos repartidos en muchos días: marcas, no una línea.
//
// EL PROBLEMA QUE RESUELVE
//
// "Installs over time" dibujaba 30 días para 8 instalaciones. En tenant 111,
// 27 de los 30 días eran cero y las dos series iban pegadas al eje: una
// gráfica cuya tinta es casi toda el número cero.
//
// ⚠️ Y NO ERA SÓLO FEO, AFIRMABA ALGO FALSO. Una línea que une el 18 de agosto
// con el 6 de septiembre pasando por ceros dice que entre esos puntos hay una
// magnitud que evolucionó. No la hay: hay ausencia de eventos. La línea es el
// tipo de gráfica para una serie continua muestreada; unas pocas instalaciones
// sueltas no son eso. Las barras no interpolan — un hueco se ve como hueco.
//
// Por encima de cierta densidad la línea SÍ es mejor, porque entonces la forma
// dice algo que los números sueltos no: por eso esto convive con la línea en
// vez de sustituirla, y `shouldUseStrip` es quien decide.

import * as React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";

import { BRAND, ROLE, TEXT } from "../../theme/brand";

/**
 * ¿Merece la pena una línea, o son cuatro eventos sueltos?
 *
 * El umbral cuenta DÍAS CON DATOS, no instalaciones: cien instalaciones en un
 * solo día siguen siendo un punto, y una línea de un punto no es nada.
 */
export function shouldUseStrip(buckets, minDaysWithData = 8) {
  const rows = Array.isArray(buckets) ? buckets : [];
  const withData = rows.filter(
    (b) => Number(b?.succeeded ?? 0) > 0 || Number(b?.failed ?? 0) > 0
  ).length;
  return withData > 0 && withData < minDaysWithData;
}

/**
 * Los días con algo, con su posición real en la ventana.
 *
 * ⚠️ La posición se calcula sobre el ÍNDICE del bucket dentro de la ventana,
 * que es lo que conserva los huecos. Repartir las marcas a intervalos iguales
 * las ordenaría bien y mentiría igual que la línea: dos instalaciones
 * separadas por tres semanas se verían como dos días seguidos.
 */
export function stripEvents(buckets) {
  const rows = Array.isArray(buckets) ? buckets : [];
  const span = Math.max(1, rows.length - 1);
  const events = [];
  let succeeded = 0;
  let failed = 0;

  for (const [i, b] of rows.entries()) {
    const ok = Number(b?.succeeded ?? 0);
    const bad = Number(b?.failed ?? 0);
    succeeded += ok;
    failed += bad;
    if (ok === 0 && bad === 0) continue;
    events.push({
      day: String(b?.day ?? b?.bucket ?? ""),
      succeeded: ok,
      failed: bad,
      // 0..100 sobre la ventana; con un solo bucket cae a la izquierda, que es
      // donde está.
      pct: rows.length === 1 ? 0 : (i / span) * 100,
    });
  }

  const peak = events.reduce((m, e) => Math.max(m, e.succeeded + e.failed), 0);
  return { events, succeeded, failed, total: succeeded + failed, peak };
}

// El ancho no codifica nada —lo hace la altura—, así que se elige por
// legibilidad: a 12 px una marca se pierde en un panel de 1200.
const MARK_W = 16;
const PLOT_H = 96;

export default function InstallDaysStrip({ buckets }) {
  const { events, succeeded, failed, total, peak } = React.useMemo(
    () => stripEvents(buckets),
    [buckets]
  );

  const first = buckets?.[0];
  const last = buckets?.[buckets.length - 1];

  return (
    <Box>
      <Box
        sx={{
          position: "relative",
          height: PLOT_H,
          borderBottom: `1px solid ${BRAND.border}`,
          mt: 1,
        }}
      >
        {events.map((e) => {
          const h = peak ? Math.max(10, ((e.succeeded + e.failed) / peak) * (PLOT_H - 12)) : 10;
          const okH = e.succeeded + e.failed ? (e.succeeded / (e.succeeded + e.failed)) * h : 0;
          return (
            <Tooltip
              key={e.day}
              title={`${e.day}: ${e.succeeded} succeeded, ${e.failed} failed`}
            >
              <Box
                aria-label={`${e.day}: ${e.succeeded} succeeded, ${e.failed} failed`}
                sx={{
                  position: "absolute",
                  bottom: 0,
                  left: `calc(${e.pct}% - ${MARK_W / 2}px)`,
                  width: MARK_W,
                  height: h,
                  borderRadius: "3px 3px 0 0",
                  overflow: "hidden",
                  bgcolor: ROLE.critical,
                }}
              >
                {/* Lo que salió bien, abajo: la base de la barra es el suelo
                    del que se levanta el fallo. */}
                <Box
                  sx={{
                    position: "absolute",
                    bottom: 0,
                    width: "100%",
                    height: okH,
                    bgcolor: ROLE.positive,
                  }}
                />
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.5 }}>
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
          {String(first?.day ?? first?.bucket ?? "")}
        </Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
          {String(last?.day ?? last?.bucket ?? "")}
        </Typography>
      </Stack>

      {/* ⚠️ La leyenda lleva los totales, y por eso el panel "Install outcomes"
          —tres barras horizontales para tres números— sobra a este volumen. */}
      <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, fontWeight: 700 }}>
          {total} install{total === 1 ? "" : "s"}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: ROLE.positive }}>
          {succeeded} succeeded
        </Typography>
        {failed ? (
          <Typography sx={{ fontSize: TEXT.sm, color: ROLE.critical }}>{failed} failed</Typography>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontStyle: "italic" }}>
          One mark per day with activity
        </Typography>
      </Stack>
    </Box>
  );
}
