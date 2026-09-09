// Dónde ha estado un equipo, en orden y con las horas.
//
// ADR-0018 fase 2. SUSTITUYE a la lista de lugares del drawer: dos paneles
// contestando "dónde ha estado" con dos formas distintas es un patrón que este
// producto ya pagó.
//
// ⚠️ LO QUE ESTE PANEL NO PUEDE DECIR, Y POR QUÉ.
//
// Cada estancia tiene DOS relojes: hasta cuándo se CONFIRMÓ al equipo allí, y
// cuándo se supo que ya no estaba. Entre los dos hay un hueco del tamaño de la
// cadencia de reporte — medido: ~1,1 h en un tenant, ~9,7 h en el más grande.
// El equipo se fue en algún punto de ese hueco y no se sabe cuándo.
//
// Por eso aquí se lee "confirmado hasta las 09:20 · se fue antes de las 19:05"
// y jamás "salió a las 19:05". Colapsar los dos relojes en una hora de salida
// sería inventar el dato más caro del expediente, con formato de hecho.

import * as React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { formatDetailDate, placeLabel, departureText } from "./hostHelpers";

function Estancia({ ep, esActual }) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ py: 0.75, borderLeft: `2px solid ${esActual ? ROLE.positive : BRAND.border}`, pl: 1.5 }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
            {placeLabel(ep)}
          </Typography>
          {esActual ? (
            <Chip
              size="small"
              label="current"
              sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 700, bgcolor: "rgba(46,125,50,.12)", color: ROLE.positive }}
            />
          ) : null}
          {ep.accuracyM ? (
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
              ±{Math.round(ep.accuracyM)} m
            </Typography>
          ) : null}
        </Stack>

        {/* ⚠️ Los dos relojes, siempre juntos y siempre en este orden. Lo
            confirmado primero, lo inferido después y en gris. */}
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          confirmed {formatDetailDate(ep.firstSeenAt)} – {formatDetailDate(ep.lastSeenAt)}
        </Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", fontStyle: "italic" }}>
          {departureText(ep)}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", whiteSpace: "nowrap" }}>
        {ep.tickCount}× seen
      </Typography>
    </Stack>
  );
}

export default function DeviceLocationTimeline({
  episodes,
  retentionDays,
  /** El anillo de lugares, para la ventana en que aún no hay estancias. */
  fallbackPlaces = 0,
  /**
   * La fecha pedida cae antes de lo que se guarda.
   *
   * ⚠️ Sólo llega cuando alguien BUSCA por fecha. Sin esta rama, preguntar por
   * el 1 de julio devolvería "no hay ninguna estancia registrada todavía", que
   * es una afirmación sobre dónde estuvo el equipo sostenida por datos que se
   * borraron. Caducado y vacío no son lo mismo, y el que busca por fecha es
   * justo quien no puede distinguirlos por su cuenta.
   */
  beyondRetention = false,
  retentionFloor = null,
}) {
  const lista = Array.isArray(episodes) ? episodes : [];

  if (beyondRetention) {
    return (
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.warningText }}>
        Stays are only kept for {retentionDays} days, so that date is no longer stored — this is
        not the same as the device having been nowhere.
        {retentionFloor ? ` Data starts from ${formatDetailDate(retentionFloor)}.` : ""}
      </Typography>
    );
  }

  if (lista.length === 0) {
    return (
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
        {/* ⚠️ La ventana de transición, dicha en voz alta. La línea de tiempo se
            escribe desde que la función existe: un equipo con meses de
            historial en el anillo no tiene ni una estancia el primer día. Un
            panel vacío sin explicación se leería como "este equipo no se ha
            movido nunca", que es una afirmación y no una ausencia. */}
        No stay recorded for this device yet. The timeline is written as devices check in, so it
        starts from when this feature was switched on — not from the device&apos;s whole history.
        {fallbackPlaces > 1
          ? ` Its ${fallbackPlaces} known places are still listed above.`
          : ""}
      </Typography>
    );
  }

  return (
    <Box>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1 }}>
        {/* Las dos cosas que el formato invita a leer mal: que las horas de
            salida sean exactas, y que haya historia ilimitada. */}
        Each stay shows when the device was <strong>confirmed</strong> there. It left at some point
        after the last confirmation and before it appeared elsewhere — that gap is the reporting
        interval, not a measurement.
        {retentionDays ? ` Stays are kept for ${retentionDays} days.` : ""}
      </Typography>
      <Stack spacing={0.5}>
        {lista.map((ep, i) => (
          <Estancia key={ep.id} ep={ep} esActual={i === 0 && !ep.endedAt} />
        ))}
      </Stack>
    </Box>
  );
}
