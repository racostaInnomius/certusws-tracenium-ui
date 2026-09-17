// Actividad de las geocercas: qué dicen ahora y qué ha cambiado.
//
// ⚠️ ESTA VISTA YA MINTIÓ DOS VECES, Y LAS DOS SIGUEN VIGENTES COMO REGLAS.
//
//  1. El rótulo `toState === "inside" ? "entered" : "left"` decía "left" de
//     transiciones que venían de `indeterminate`: afirmaba que un equipo salió
//     de un sitio donde nunca se le confirmó dentro. Sólo `inside → outside` es
//     una salida, y eso lo decide el PAR, nunca el destino solo.
//  2. Fue una lista plana. Medido en T111 (09-sep): de 41 eventos, 39 eran la
//     cerca colocando por primera vez a cada equipo el día que se encendió. Una
//     pared de filas casi idénticas de la que no salía lo único que importa.
//
// ⚠️ Y AHORA EL TERCERO, QUE ES DE FORMA: los tres bloques de texto que
// arreglaron (2) seguían sin contestar de un vistazo. Medido el 2026-09-17, en
// T111 hay 6 salidas en cinco semanas: la pregunta «¿se ha ido alguien?» se
// contestaba leyendo párrafos. De ahí este orden:
//
//   · CIFRAS — dentro / fuera / sin certeza, y salidas en la ventana.
//   · CERCAS — la barra por cerca, con su pulso de movimientos por día.
//   · ACTIVIDAD — UNA línea de tiempo por días, filtrable, donde la carga
//     inicial se colapsa en una fila por día en vez de ocupar la pantalla.
//
// ⚠️ «La cerca perdió la certeza» NO es un evento: `to_state` sólo acepta
// `inside`/`outside` (20260909_geofence_phase1.sql:141). El clasificador lo
// sigue contemplando —la BD podría admitirlo mañana— pero no se ofrece como
// categoría: prometer un filtro que nunca tendrá filas es prometer un dato.

import * as React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { formatDetailDate } from "./hostHelpers";
import { formatRelative } from "../../utils/format";

const CONOCIDOS = new Set(["inside", "outside"]);

/**
 * Qué clase de suceso es. Mirando el par ENTERO, nunca sólo el destino.
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
  positive: { bgcolor: "rgba(46,125,50,.12)", color: BRAND.alert.successText },
  alert: { bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.errorText },
  neutral: { bgcolor: BRAND.border, color: "text.secondary" },
};

const VENTANAS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

/** El día de un instante, en local, para agrupar y comparar. */
export function dayKey(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * La actividad, lista para pintar: un grupo por día y, dentro, los movimientos
 * uno a uno y las primeras confirmaciones COLAPSADAS por sitio y destino.
 *
 * ⚠️ Colapsar no es esconder: la fila colapsada dice cuántas son y de dónde
 * salen los números de arriba. Listarlas una por una es lo que convertía el día
 * en que se enciende una cerca en una pared de 41 filas idénticas.
 */
export function groupActivity(events, filtro) {
  const dias = new Map();
  for (const e of Array.isArray(events) ? events : []) {
    const clase = classifyTransition(e.fromState, e.toState);
    if (filtro === "movements" && clase !== "movement") continue;
    if (filtro === "first" && clase !== "first") continue;
    const dia = dayKey(e.occurredAt);
    let grupo = dias.get(dia);
    if (!grupo) {
      grupo = { day: dia, at: e.occurredAt, movements: [], first: new Map() };
      dias.set(dia, grupo);
    }
    if (clase === "movement" || clase === "lost") {
      grupo.movements.push(e);
    } else {
      const clave = `${e.siteName}|${e.toState}`;
      const previo = grupo.first.get(clave);
      if (previo) previo.count += 1;
      else grupo.first.set(clave, { siteName: e.siteName, toState: e.toState, count: 1, sample: e });
    }
  }
  return [...dias.values()].map((g) => ({ ...g, first: [...g.first.values()] }));
}

/** Cuántos días de pulso caben, rellenando los que no tienen eventos. */
export function sparkDays(daily, days = 14, now = new Date()) {
  const porDia = new Map((Array.isArray(daily) ? daily : []).map((d) => [d.day, d]));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    const fila = porDia.get(key);
    out.push({
      day: key,
      departures: Number(fila?.departures || 0),
      returns: Number(fila?.returns || 0),
      total: Number(fila?.total || 0),
    });
  }
  return out;
}

function Cifra({ label, value, color, hint }) {
  return (
    <Box
      sx={{
        flex: "1 1 160px",
        p: 1.5,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 2,
        bgcolor: BRAND.surface,
      }}
    >
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: color || BRAND.dark }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{hint}</Typography>
    </Box>
  );
}

/** El pulso de movimientos: una columna por día, las salidas en rojo. */
function Pulso({ daily }) {
  const dias = sparkDays(daily);
  const tope = Math.max(1, ...dias.map((d) => d.total));
  return (
    <Box sx={{ minWidth: 170 }}>
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
        Activity · last 14 days
      </Typography>
      <Stack direction="row" spacing={0.4} alignItems="flex-end" sx={{ height: 34, mt: 0.75 }}>
        {dias.map((d) => (
          <Box
            key={d.day}
            title={`${d.day}: ${d.total} event${d.total === 1 ? "" : "s"}${
              d.departures ? `, ${d.departures} departure${d.departures === 1 ? "" : "s"}` : ""
            }`}
            sx={{
              width: 9,
              height: `${Math.max(3, (d.total / tope) * 34)}px`,
              borderRadius: "2px 2px 0 0",
              bgcolor: d.departures > 0 ? BRAND.alert.error : d.total > 0 ? BRAND.tealSoftStrong : BRAND.border,
            }}
          />
        ))}
      </Stack>
    </Box>
  );
}

/** Barra apilada dentro/fuera/sin certeza. Una cerca, de un vistazo. */
function StateBar({ site }) {
  const dentro = Number(site.inside) || 0;
  const fuera = Number(site.outside) || 0;
  const dudoso = Number(site.indeterminate) || 0;
  const total = dentro + fuera + dudoso;

  return (
    <Box sx={{ flex: 1, minWidth: 240 }}>
      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>
          {site.siteName}
        </Typography>
        {site.radiusM ? (
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
            {site.radiusM} m radius
          </Typography>
        ) : null}
      </Stack>
      {total === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.25 }}>
          {/* ⚠️ Cero equipos evaluados NO es "nadie está aquí": es que la cerca
              aún no ha visto reportar a nadie. */}
          no device evaluated yet
        </Typography>
      ) : (
        <>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.25 }}>
            <Box component="span" sx={{ color: BRAND.alert.successText, fontWeight: 700 }}>
              {`${dentro} inside`}
            </Box>
            {" · "}
            <Box component="span" sx={{ color: BRAND.alert.errorText, fontWeight: 700 }}>
              {`${fuera} outside`}
            </Box>
            {" · "}
            <Box component="span">{`${dudoso} unclear`}</Box>
            {site.lastEvaluatedAt ? (
              <Box component="span">{` — last evaluated ${formatRelative(site.lastEvaluatedAt)}`}</Box>
            ) : null}
          </Typography>
          <Box sx={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", bgcolor: BRAND.border, mt: 0.75 }}>
            {dentro > 0 ? <Box sx={{ width: `${(dentro / total) * 100}%`, bgcolor: ROLE.positive }} /> : null}
            {fuera > 0 ? <Box sx={{ width: `${(fuera / total) * 100}%`, bgcolor: BRAND.alert.error }} /> : null}
            {dudoso > 0 ? <Box sx={{ width: `${(dudoso / total) * 100}%`, bgcolor: "#B9C0CC" }} /> : null}
          </Box>
        </>
      )}
    </Box>
  );
}

const PUNTOS = {
  left: { bgcolor: BRAND.alert.error },
  back: { bgcolor: ROLE.positive },
  first: { bgcolor: BRAND.surface, border: `2px solid ${BRAND.gray}` },
};

function Punto({ kind }) {
  return <Box sx={{ width: 12, height: 12, borderRadius: "50%", mt: "4px", ...PUNTOS[kind] }} />;
}

/** Una transición, en la línea de tiempo. */
function Fila({ e }) {
  const { text, tone } = transitionLabel(e.fromState, e.toState);
  const salida = e.fromState === "inside" && e.toState === "outside";
  return (
    <Stack
      direction="row"
      spacing={1.25}
      sx={{ py: 1, borderBottom: `1px solid ${BRAND.border}` }}
    >
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", width: 56, textAlign: "right", pt: "2px" }}>
        {new Date(e.occurredAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
      </Typography>
      <Punto kind={salida ? "left" : e.toState === "inside" && e.fromState === "outside" ? "back" : "first"} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
          {/* El hostname, no el UUID. Sin él esto es ilegible. */}
          <Box component="span" sx={{ fontWeight: 800 }}>{e.hostname || e.agentId}</Box>{" "}
          {text === "left" ? "left" : text === "came back" ? "came back to" : "was confirmed at"}{" "}
          {e.siteName}
          <Chip
            size="small"
            label={text}
            sx={{ height: 18, ml: 0.75, fontSize: TEXT.xs, fontWeight: 700, ...TONOS[tone] }}
          />
        </Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
          {/* El método viaja con el evento: "por red" y "por coordenadas" no
              merecen la misma confianza. */}
          by {e.method === "network" ? "network" : "coordinates"}
          {e.distanceM !== null && e.distanceM !== undefined ? ` · ${e.distanceM} m from the pin` : ""}
          {e.accuracyM !== null && e.accuracyM !== undefined ? ` · ±${e.accuracyM} m accuracy` : ""}
        </Typography>
      </Box>
    </Stack>
  );
}

/** Las primeras confirmaciones de un día, en una sola fila que se despliega. */
function FilaPrimeras({ grupo, eventos }) {
  const [abierto, setAbierto] = React.useState(false);
  const detalle = eventos.filter(
    (e) => classifyTransition(e.fromState, e.toState) === "first" && e.siteName === grupo.siteName && e.toState === grupo.toState
  );
  return (
    <Box sx={{ py: 1, borderBottom: `1px solid ${BRAND.border}` }}>
      <Stack direction="row" spacing={1.25}>
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", width: 56, textAlign: "right", pt: "2px" }}>
          all day
        </Typography>
        <Punto kind="first" />
        <Box>
          <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
            <Box component="span" sx={{ fontWeight: 800 }}>{grupo.count}</Box>{" "}
            {grupo.count === 1 ? "device was" : "devices were"} first confirmed{" "}
            {grupo.toState === "inside" ? "inside" : "away from"} {grupo.siteName}
          </Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
            {/* ⚠️ Esto explica de dónde salen las cifras de arriba; no dice que
                nadie se haya movido. */}
            Where the counts above come from, not something that happened.{" "}
            <Box
              component="button"
              type="button"
              onClick={() => setAbierto((v) => !v)}
              sx={{
                background: "none", border: 0, p: 0, cursor: "pointer",
                font: "inherit", color: BRAND.tealText, fontWeight: 700,
              }}
            >
              {abierto ? "Hide the devices" : `Show the ${grupo.count === 1 ? "device" : `${grupo.count} devices`}`}
            </Box>
          </Typography>
          {abierto ? (
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.75 }}>
              {detalle.map((e) => (
                <Chip
                  key={e.id}
                  size="small"
                  label={e.hostname || e.agentId}
                  title={formatDetailDate(e.occurredAt)}
                  sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.surfaceMuted, color: BRAND.dark }}
                />
              ))}
            </Stack>
          ) : null}
        </Box>
      </Stack>
    </Box>
  );
}

function tituloDia(day) {
  const hoy = dayKey(new Date().toISOString());
  const ayer = dayKey(new Date(Date.now() - 86400_000).toISOString());
  const etiqueta = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short",
  });
  if (day === hoy) return `Today — ${etiqueta}`;
  if (day === ayer) return `Yesterday — ${etiqueta}`;
  return etiqueta;
}

export default function RecentTransitions({
  events,
  sites,
  loading = false,
  error = null,
  activity = null,
  days = 30,
  onDaysChange = null,
}) {
  const lista = React.useMemo(() => (Array.isArray(events) ? events : []), [events]);
  const cercas = (Array.isArray(sites) ? sites : []).filter((s) => s.geofenceStatus === "monitoring");
  // ⚠️ El filtro por defecto es «movimientos» porque es la pregunta; pero
  // cuando no hay NINGUNO, filtrar dejaría la pantalla en blanco justo el día
  // que se enciende una cerca — que es cuando más falta hace ver de dónde
  // salen las cifras. Sin movimientos se abre en «todo».
  const [filtroElegido, setFiltro] = React.useState(null);

  const estado = React.useMemo(() => {
    let dentro = 0, fuera = 0, dudoso = 0;
    for (const s of cercas) {
      dentro += Number(s.inside) || 0;
      fuera += Number(s.outside) || 0;
      dudoso += Number(s.indeterminate) || 0;
    }
    return { dentro, fuera, dudoso, total: dentro + fuera + dudoso };
  }, [cercas]);

  const totales = activity?.totals ?? null;
  const sinMovimientos = totales
    ? totales.movements === 0
    : lista.every((e) => classifyTransition(e.fromState, e.toState) !== "movement");
  const filtro = filtroElegido ?? (sinMovimientos ? "all" : "movements");
  const grupos = React.useMemo(() => groupActivity(lista, filtro), [lista, filtro]);

  if (error) {
    return (
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText }}>
        {/* Un fallo NO es "no ha pasado nada": lo segundo afirmaría que ningún
            equipo se ha movido. */}
        Geofence activity could not be loaded, so this is not showing what happened.
      </Typography>
    );
  }
  if (loading) {
    return <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading…</Typography>;
  }
  if (cercas.length === 0) {
    return (
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
        No fence is switched on, so there is nothing to report on. Turn one on under Geofences.
      </Typography>
    );
  }

  const filtros = [
    { key: "movements", label: "Movements", count: totales?.movements },
    { key: "all", label: "Everything", count: totales?.all },
    { key: "first", label: "First confirmations", count: totales?.firstConfirmations },
  ];

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", rowGap: 1.5, mb: 2 }}>
        <Cifra
          label="Inside now"
          value={estado.dentro}
          color={BRAND.alert.successText}
          hint={`of ${estado.total} device${estado.total === 1 ? "" : "s"} evaluated`}
        />
        <Cifra
          label="Away"
          value={estado.fuera}
          color={BRAND.alert.errorText}
          hint="confirmed outside their fence"
        />
        {/* ⚠️ "Unclear" se enseña SIEMPRE, aunque sea cero: es el estado que
            dice "la medición no alcanza", y esconderlo haría creer que la cerca
            tiene una opinión sobre todos los equipos. */}
        <Cifra label="Unclear" value={estado.dudoso} hint="reading too coarse to decide" />
        <Cifra
          label={`Departures · ${days} days`}
          value={totales ? totales.departures : "—"}
          hint={
            totales?.lastDepartureAt
              ? `last one ${formatRelative(totales.lastDepartureAt)}`
              : "nobody confirmed inside has left"
          }
        />
      </Stack>

      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {cercas.map((s) => (
          <Stack
            key={s.id}
            direction="row"
            spacing={2}
            sx={{
              p: 1.5, border: `1px solid ${BRAND.border}`, borderRadius: 2,
              bgcolor: BRAND.surface, flexWrap: "wrap", rowGap: 1.5,
            }}
          >
            <StateBar site={s} />
            {cercas.length === 1 ? <Pulso daily={activity?.daily} /> : null}
          </Stack>
        ))}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, mb: 1.5, alignItems: "center" }}>
        {filtros.map((f) => (
          <Chip
            key={f.key}
            size="small"
            label={f.count === undefined || f.count === null ? f.label : `${f.label} · ${f.count}`}
            onClick={() => setFiltro(f.key)}
            aria-pressed={filtro === f.key}
            sx={{
              height: 26, fontSize: TEXT.xs, fontWeight: 700,
              bgcolor: filtro === f.key ? BRAND.tealSoft : "transparent",
              color: filtro === f.key ? BRAND.tealText : "text.secondary",
              border: `1px solid ${filtro === f.key ? BRAND.tealText : BRAND.border}`,
            }}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        {onDaysChange
          ? VENTANAS.map((v) => (
              <Chip
                key={v.days}
                size="small"
                label={v.label}
                onClick={() => onDaysChange(v.days)}
                aria-pressed={days === v.days}
                sx={{
                  height: 26, fontSize: TEXT.xs, fontWeight: 700,
                  bgcolor: days === v.days ? BRAND.tealSoft : "transparent",
                  color: days === v.days ? BRAND.tealText : "text.secondary",
                  border: `1px solid ${days === v.days ? BRAND.tealText : BRAND.border}`,
                }}
              />
            ))
          : null}
      </Stack>

      {/* ⚠️ Un corte se dice: con el tope puesto, la lista NO es todo lo que
          pasó — y los totales de arriba, que se cuentan en la base, ya no
          cuadrarían con lo que se ve. */}
      {activity?.truncated ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.warningText, mb: 1 }}>
          Only the {activity.limit} most recent entries are listed; the counts above cover the whole
          window.
        </Typography>
      ) : null}

      {/* ⚠️ Cero movimientos es un RESULTADO, no un hueco — y se dice pase lo
          que pase con el filtro, porque es la respuesta a la pregunta con la
          que se entra. El motivo importa: la cadencia de esta flota se mide en
          horas. */}
      {sinMovimientos ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1 }}>
          No device has moved between a confirmed inside and a confirmed outside in the last {days}{" "}
          days. With this fleet&apos;s reporting interval a move can take hours to show up.
        </Typography>
      ) : null}

      {grupos.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          {filtro === "movements" ? "" : `Nothing was recorded in the last ${days} days.`}
        </Typography>
      ) : (
        grupos.map((g) => (
          <Box key={g.day}>
            <Typography
              sx={{
                fontSize: TEXT.xs, fontWeight: 800, color: "text.secondary",
                mt: 2, mb: 0.5,
              }}
            >
              {tituloDia(g.day)}
            </Typography>
            {g.movements.map((e) => <Fila key={e.id} e={e} />)}
            {g.first.map((grupo) => (
              <FilaPrimeras key={`${grupo.siteName}|${grupo.toState}`} grupo={grupo} eventos={lista} />
            ))}
          </Box>
        ))
      )}
    </Box>
  );
}
