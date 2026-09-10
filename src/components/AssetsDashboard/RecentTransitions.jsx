// Los cambios de veredicto de las geocercas, en orden.
//
// ⚠️ LO QUE UNA TRANSICIÓN DICE DEPENDE DE DÓNDE VIENE, NO SÓLO DE ADÓNDE VA.
//
// Esta lista estuvo rotulando `toState === "inside" ? "entered" : "left"`, y eso
// es falso para la mitad de los casos. Las dos primeras transiciones reales de
// producción (T1, 09-sep) fueron `indeterminate → outside`: el equipo NO salió
// de un sitio —nunca se le confirmó dentro—, simplemente quedó confirmado en
// otra parte. Pintarlo como "left" afirma una salida que no ocurrió.
//
// La distinción no es cosmética: `inside → outside` es la única que significa
// "se fue", y es la que la fase 2 del ADR-0017 querría convertir en alerta.
// Confundirla con las demás haría sonar el aviso por portátiles que jamás
// estuvieron en la oficina.

import * as React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { formatDetailDate } from "./hostHelpers";

/**
 * Qué decir de una transición, mirando el par entero.
 *
 * `tone`: "positive" para una presencia confirmada, "alert" para una salida
 * real, y neutro para todo lo demás — porque todo lo demás es un cambio de
 * conocimiento, no un movimiento.
 */
export function transitionLabel(fromState, toState) {
  if (toState === "inside") {
    return fromState === "outside"
      ? { text: "came back", tone: "positive" }
      : { text: "confirmed here", tone: "positive" };
  }
  if (toState === "outside") {
    // ⚠️ La ÚNICA salida de verdad: estaba confirmado dentro y ya no lo está.
    if (fromState === "inside") return { text: "left", tone: "alert" };
    // Venía de "no lo sé". Se ha confirmado en otro lado, que no es lo mismo.
    return { text: "confirmed elsewhere", tone: "neutral" };
  }
  // Hacia indeterminate: se perdió la certeza. No es un movimiento.
  return { text: "no longer certain", tone: "neutral" };
}

const TONOS = {
  positive: { bgcolor: "rgba(46,125,50,.12)", color: ROLE.positive },
  alert: { bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.error },
  neutral: { bgcolor: BRAND.border, color: "text.secondary" },
};

export default function RecentTransitions({ events, loading = false, error = null }) {
  const lista = Array.isArray(events) ? events : [];

  return (
    <Box>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 2 }}>
        A transition is recorded when a device&apos;s verdict for a fence changes and stays changed
        for two consecutive check-ins. Only <strong>left</strong> means the device was confirmed
        inside and then confirmed away — the other wordings are changes in what is known, not
        movements.
      </Typography>

      {error ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.error }}>
          {/* Un fallo NO es "no ha pasado nada": lo segundo sería afirmar que
              ningún equipo se ha movido. */}
          Transitions could not be loaded, so this list is not showing what happened.
        </Typography>
      ) : loading ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading…</Typography>
      ) : lista.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          {/* Tres razones distintas para una lista vacía, y ninguna es "nadie se
              ha movido". Callarlas haría que la función pareciera averiada. */}
          No transition recorded yet. A fence has to be switched on, and a device has to check in
          twice with a changed verdict before anything appears here — with this fleet&apos;s
          reporting interval that can take hours.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {lista.map((e) => {
            const { text, tone } = transitionLabel(e.fromState, e.toState);
            return (
              <Stack
                key={e.id}
                direction="row"
                spacing={1}
                alignItems="baseline"
                sx={{ flexWrap: "wrap", py: 0.5, borderBottom: `1px solid ${BRAND.border}` }}
              >
                <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, minWidth: 160 }}>
                  {/* El hostname, no el UUID. Sin él esto es ilegible. */}
                  {e.hostname || e.agentId}
                </Typography>
                <Chip
                  size="small"
                  label={text}
                  sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 700, ...TONOS[tone] }}
                />
                <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>{e.siteName}</Typography>
                <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
                  {/* El método viaja con el evento: "por red" y "por
                      coordenadas" no merecen la misma confianza. */}
                  {formatDetailDate(e.occurredAt)} · by{" "}
                  {e.method === "network" ? "network" : "coordinates"}
                  {e.distanceM !== null && e.distanceM !== undefined ? ` · ${e.distanceM} m` : ""}
                  {e.accuracyM !== null && e.accuracyM !== undefined ? ` · ±${e.accuracyM} m` : ""}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
