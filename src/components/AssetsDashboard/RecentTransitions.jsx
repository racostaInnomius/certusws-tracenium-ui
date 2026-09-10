// Qué dicen hoy las geocercas, y qué ha cambiado de verdad.
//
// ⚠️ ESTA VISTA ERA UNA LISTA PLANA Y MENTÍA POR OMISIÓN.
//
// Medido en producción (T111, 09-sep): de 41 eventos, **39 eran
// `indeterminate -> inside`**, uno por equipo, ninguno repetido. No era un
// registro de movimientos: era la cerca aprendiendo dónde estaba cada equipo el
// día que se encendió, presentado como cuarenta y un sucesos. El operador leía
// una pared de filas casi idénticas y no podía sacar de ahí lo único que
// importa — cuántos están dentro ahora, y si alguien se ha ido.
//
// De ahí los tres bloques, en este orden:
//
//   1. ESTADO — lo que la cerca afirma ahora mismo. Es la respuesta al 90 % de
//      las visitas a esta pantalla.
//   2. MOVIMIENTOS — sólo los cambios entre dos estados CONOCIDOS. Son los
//      únicos que significan que un equipo se movió, y los únicos que la fase 2
//      del ADR-0017 convertiría en alerta.
//   3. PRIMERAS CONFIRMACIONES — la carga inicial, agrupada y contada. Se
//      muestra porque explica de dónde salió el estado, no como suceso.

import * as React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { formatDetailDate } from "./hostHelpers";

const CONOCIDOS = new Set(["inside", "outside"]);

/**
 * Qué clase de suceso es. Mirando el par ENTERO, nunca sólo el destino.
 *
 * El rótulo `toState === "inside" ? "entered" : "left"` que estuvo en
 * producción decía "left" de las dos transiciones reales de T1, que venían de
 * `indeterminate`: afirmaba que un equipo salió de un sitio donde nunca se le
 * confirmó dentro.
 */
export function classifyTransition(fromState, toState) {
  if (toState === "indeterminate") return "lost";
  if (CONOCIDOS.has(fromState) && CONOCIDOS.has(toState) && fromState !== toState) {
    return "movement";
  }
  return "first";
}

export function transitionLabel(fromState, toState) {
  if (toState === "inside") {
    return fromState === "outside"
      ? { text: "came back", tone: "positive" }
      : { text: "confirmed here", tone: "positive" };
  }
  if (toState === "outside") {
    // ⚠️ La ÚNICA salida de verdad: estaba confirmado dentro y ya no lo está.
    if (fromState === "inside") return { text: "left", tone: "alert" };
    return { text: "confirmed elsewhere", tone: "neutral" };
  }
  return { text: "no longer certain", tone: "neutral" };
}

const TONOS = {
  positive: { bgcolor: "rgba(46,125,50,.12)", color: ROLE.positive },
  alert: { bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.error },
  neutral: { bgcolor: BRAND.border, color: "text.secondary" },
};

/** Barra apilada dentro/fuera/sin certeza. Una cerca, de un vistazo. */
function StateBar({ site }) {
  const dentro = Number(site.inside) || 0;
  const fuera = Number(site.outside) || 0;
  const dudoso = Number(site.indeterminate) || 0;
  const total = dentro + fuera + dudoso;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
          {site.siteName}
        </Typography>
        {total === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
            {/* ⚠️ Cero equipos evaluados NO es "nadie está aquí": es que la cerca
                aún no ha visto reportar a nadie. */}
            no device evaluated yet
          </Typography>
        ) : (
          <>
            <Typography sx={{ fontSize: TEXT.sm, color: ROLE.positive, fontWeight: 700 }}>
              {dentro} inside
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.error, fontWeight: 700 }}>
              {fuera} outside
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              {dudoso} unclear
            </Typography>
          </>
        )}
      </Stack>
      {total > 0 ? (
        <Box sx={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", bgcolor: BRAND.border }}>
          {dentro > 0 ? <Box sx={{ width: `${(dentro / total) * 100}%`, bgcolor: ROLE.positive }} /> : null}
          {fuera > 0 ? <Box sx={{ width: `${(fuera / total) * 100}%`, bgcolor: BRAND.alert.error }} /> : null}
          {dudoso > 0 ? <Box sx={{ width: `${(dudoso / total) * 100}%`, bgcolor: "#B9C0CC" }} /> : null}
        </Box>
      ) : null}
    </Box>
  );
}

function Evento({ e }) {
  const { text, tone } = transitionLabel(e.fromState, e.toState);
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="baseline"
      sx={{ flexWrap: "wrap", py: 0.5, borderBottom: `1px solid ${BRAND.border}` }}
    >
      <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, minWidth: 160 }}>
        {/* El hostname, no el UUID. Sin él esto es ilegible. */}
        {e.hostname || e.agentId}
      </Typography>
      <Chip size="small" label={text} sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 700, ...TONOS[tone] }} />
      <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>{e.siteName}</Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
        {/* El método viaja con el evento: "por red" y "por coordenadas" no
            merecen la misma confianza. */}
        {formatDetailDate(e.occurredAt)} · by {e.method === "network" ? "network" : "coordinates"}
        {e.distanceM !== null && e.distanceM !== undefined ? ` · ${e.distanceM} m` : ""}
        {e.accuracyM !== null && e.accuracyM !== undefined ? ` · ±${e.accuracyM} m` : ""}
      </Typography>
    </Stack>
  );
}

function Titulo({ children, sub }) {
  return (
    <Box sx={{ mt: 2, mb: 1 }}>
      <Typography
        sx={{
          fontSize: TEXT.xs, fontWeight: 800, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "text.secondary",
        }}
      >
        {children}
      </Typography>
      {sub ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5 }}>{sub}</Typography>
      ) : null}
    </Box>
  );
}

export default function RecentTransitions({ events, sites, loading = false, error = null }) {
  const lista = Array.isArray(events) ? events : [];
  const cercas = (Array.isArray(sites) ? sites : []).filter((s) => s.geofenceStatus === "monitoring");

  const { movimientos, primeras, perdidas } = React.useMemo(() => {
    const m = [], p = [], l = [];
    for (const e of lista) {
      const clase = classifyTransition(e.fromState, e.toState);
      if (clase === "movement") m.push(e);
      else if (clase === "lost") l.push(e);
      else p.push(e);
    }
    return { movimientos: m, primeras: p, perdidas: l };
  }, [lista]);

  /** Primeras confirmaciones agrupadas por sitio y destino: 39 filas -> 2. */
  const resumenPrimeras = React.useMemo(() => {
    const mapa = new Map();
    for (const e of primeras) {
      const clave = `${e.siteName}|${e.toState}`;
      const previo = mapa.get(clave);
      if (previo) previo.count += 1;
      else mapa.set(clave, { siteName: e.siteName, toState: e.toState, count: 1 });
    }
    return [...mapa.values()].sort((a, b) => b.count - a.count);
  }, [primeras]);

  if (error) {
    return (
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.error }}>
        {/* Un fallo NO es "no ha pasado nada": lo segundo afirmaría que ningún
            equipo se ha movido. */}
        Geofence activity could not be loaded, so this is not showing what happened.
      </Typography>
    );
  }
  if (loading) {
    return <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading…</Typography>;
  }

  return (
    <Box>
      <Titulo sub="What each monitored fence says right now. A device keeps its last verdict when it stops reporting, so this is the last thing known — not a live position.">
        Where devices stand
      </Titulo>
      {cercas.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          No fence is switched on, so there is nothing to report on. Turn one on under Geofences.
        </Typography>
      ) : (
        cercas.map((s) => <StateBar key={s.id} site={s} />)
      )}

      <Titulo sub="A device that was confirmed inside a fence and is now confirmed away, or the other way round. These are the only entries that mean a device moved.">
        Movements
      </Titulo>
      {movimientos.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          {/* ⚠️ Cero movimientos es un RESULTADO, no un hueco — y el motivo
              importa: la cadencia de reporte de esta flota se mide en horas. */}
          No device has moved between a confirmed inside and a confirmed outside yet. With this
          fleet&apos;s reporting interval a move can take hours to show up.
        </Typography>
      ) : (
        <Stack spacing={0.5}>{movimientos.map((e) => <Evento key={e.id} e={e} />)}</Stack>
      )}

      {resumenPrimeras.length > 0 ? (
        <>
          <Titulo sub="The first time each device was placed by a fence. They are counted, not listed one by one: they say where the numbers above came from, not that anything happened.">
            First confirmations
          </Titulo>
          <Stack spacing={0.5}>
            {resumenPrimeras.map((r) => (
              <Stack key={`${r.siteName}|${r.toState}`} direction="row" spacing={1} alignItems="baseline">
                <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
                  {r.count}
                </Typography>
                <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                  {r.count === 1 ? "device was" : "devices were"} first confirmed{" "}
                  {r.toState === "inside" ? "inside" : "away from"} {r.siteName}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </>
      ) : null}

      {perdidas.length > 0 ? (
        <>
          <Titulo sub="The fence had a verdict and lost it — a reading too coarse to decide, not a device that moved.">
            Certainty lost
          </Titulo>
          <Stack spacing={0.5}>{perdidas.map((e) => <Evento key={e.id} e={e} />)}</Stack>
        </>
      ) : null}
    </Box>
  );
}
