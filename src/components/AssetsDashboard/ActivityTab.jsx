// src/components/AssetsDashboard/ActivityTab.jsx
//
// ADR-0031 F2 — pestaña «Activity» de la ficha del equipo: en un carril lo que
// Tracenium le ENVIÓ, en el otro lo que el agente OBSERVÓ en él. Esa separación
// es la que contesta la primera pregunta de cualquier incidencia: ¿fuimos
// nosotros?
//
// Lo que se dice sin que nadie pregunte:
//   · la fuente que no se pudo leer se nombra — un hueco en la lista no es un
//     rato sin actividad;
//   · un recorte se declara, con lo que hay que hacer para ver el resto;
//   · «no consta acción nuestra» NO es «sabemos quién fue»: la vista no nombra
//     culpables, dice qué cambió y cuándo.

import * as React from "react";
import { Alert, Box, Chip, CircularProgress, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import DateRangeControl from "./DateRangeControl";
import { lastDaysRange, rangeWindow } from "./hostHelpers";
import { getDeviceActivity } from "../../api/activity";

const MIN_HEIGHT = 420;

const LANE_LABEL = { sent: "Sent by Tracenium", observed: "Observed on the device" };
const LANE_SHORT = { sent: "Sent", observed: "Observed" };

/** La zona del navegador, que es en la que se pintan las horas. */
export function operatorTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
}

const DAY_OPTS = { weekday: "short", year: "numeric", month: "short", day: "numeric" };
const TIME_OPTS = { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" };

function dayKey(at) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", DAY_OPTS);
}

/** Agrupa por día del operador conservando el orden que trajo el backend. */
export function groupByDay(events = []) {
  const out = [];
  for (const e of events) {
    const key = dayKey(e.at);
    const last = out[out.length - 1];
    if (last && last.day === key) last.events.push(e);
    else out.push({ day: key, events: [e] });
  }
  return out;
}

function StatusChip({ status }) {
  if (!status) return null;
  const s = String(status).toLowerCase();
  const bad = /fail|error|timeout|denied|rejected|expired/.test(s);
  const good = /completed|ok|success|acked|pass|remediated/.test(s);
  return (
    <Chip
      size="small"
      label={status}
      sx={{
        height: 20,
        fontSize: TEXT.xs,
        fontWeight: 700,
        bgcolor: bad ? BRAND.alert.errorSoft : good ? BRAND.alert.successSoft : "transparent",
        color: bad ? BRAND.alert.errorText : good ? BRAND.alert.successText : TEXT_MUTED,
        border: `1px solid ${bad ? BRAND.alert.errorText : good ? BRAND.alert.successText : BRAND.border}`,
      }}
    />
  );
}

/**
 * ⚠️ El matiz entero de esta pestaña está en este chip. `not_tracenium`
 * significa que NO CONSTA acción nuestra, no que sepamos quién lo hizo: el
 * cambio pudo venir de una GPO, de otra herramienta o de una persona delante
 * del equipo. Decirlo de otra forma sería inventarse un culpable.
 */
function AttributionChip({ attribution }) {
  if (!attribution) return null;
  const ours = attribution === "tracenium";
  return (
    <Tooltip
      title={
        ours
          ? "There is an action of ours that explains this change."
          : "No action of ours explains this change. That is not the same as knowing who made it."
      }
    >
      <Chip
        size="small"
        label={ours ? "By Tracenium" : "Not from Tracenium"}
        sx={{
          height: 20,
          fontSize: TEXT.xs,
          fontWeight: 700,
          bgcolor: ours ? BRAND.tealSoft : BRAND.alert.warningSoft,
          color: ours ? BRAND.tealText : BRAND.alert.warningText,
          border: `1px solid ${ours ? BRAND.tealText : BRAND.alert.warningText}`,
        }}
      />
    </Tooltip>
  );
}

function EventRow({ event }) {
  const sent = event.lane === "sent";
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ py: 0.9, borderBottom: `1px solid ${BRAND.border}`, alignItems: "flex-start" }}
    >
      <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums", minWidth: 68, pt: 0.2 }}>
        {formatDate(event.at, TIME_OPTS)}
      </Typography>
      {/* El carril, antes que nada: es lo que separa «lo hicimos» de «pasó». */}
      <Chip
        size="small"
        label={LANE_SHORT[event.lane] || event.lane}
        sx={{
          height: 20,
          minWidth: 74,
          fontSize: TEXT.xs,
          fontWeight: 700,
          bgcolor: sent ? BRAND.tealSoft : "transparent",
          color: sent ? BRAND.tealText : TEXT_MUTED,
          border: `1px solid ${sent ? BRAND.tealText : BRAND.border}`,
        }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 0.5, alignItems: "center" }}>
          <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark, fontWeight: 600, wordBreak: "break-word" }}>
            {event.title}
          </Typography>
          <StatusChip status={event.status} />
          <AttributionChip attribution={event.attribution} />
        </Stack>
        {event.detail ? (
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", wordBreak: "break-word" }}>{event.detail}</Typography>
        ) : null}
        {event.actor ? (
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>Requested by {event.actor}</Typography>
        ) : null}
      </Box>
    </Stack>
  );
}

/**
 * La vista, sin fetch: recibe lo que haya y lo pinta. Separada a propósito
 * para poder probar los estados vacíos sin mocks.
 */
export function ActivityView({ data, loading, error }) {
  if (error) {
    return (
      <Box sx={{ minHeight: MIN_HEIGHT }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (loading || !data) {
    return (
      <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 6, minHeight: MIN_HEIGHT }}>
        <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>Loading activity…</Typography>
      </Stack>
    );
  }

  const events = data.events || [];
  const sources = data.sources || [];
  const failed = sources.filter((s) => s.status === "error");
  const unavailable = sources.filter((s) => s.status === "unavailable");
  const groups = groupByDay(events);

  return (
    <Box sx={{ minHeight: MIN_HEIGHT }}>
      {/* ⚠️ Una fuente que no se pudo leer se dice ARRIBA, no al pie: sin esto,
          el hueco que deja se lee como un rato sin actividad. */}
      {failed.length ? (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {failed.length === 1 ? "One source could not be read" : `${failed.length} sources could not be read`} (
          {failed.map((s) => s.id).join(", ")}), so this timeline is incomplete.
        </Alert>
      ) : null}

      {data.truncated ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Only the most recent {events.length} entries of this range are shown. Narrow the dates to see the rest.
        </Alert>
      ) : null}

      {events.length === 0 ? (
        <Stack spacing={1} sx={{ py: 4 }}>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>
            Nothing recorded for this device in this range.
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
            That means nothing was sent and no change was observed — not that nothing happened on the device.
          </Typography>
        </Stack>
      ) : (
        groups.map((g) => (
          <Box key={g.day} sx={{ mb: 2 }}>
            <Typography
              sx={{ fontSize: TEXT.xs, fontWeight: 800, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.4, mb: 0.5 }}
            >
              {g.day}
            </Typography>
            {g.events.map((e, i) => (
              <EventRow key={`${e.source}-${e.at}-${i}`} event={e} />
            ))}
          </Box>
        ))
      )}

      {unavailable.length ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 1 }}>
          Not available in this deployment: {unavailable.map((s) => s.id).join(", ")}.
        </Typography>
      ) : null}
    </Box>
  );
}

export default function ActivityTab({ agentId }) {
  const [range, setRange] = React.useState(() => lastDaysRange(7));
  const [lane, setLane] = React.useState("all");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  // ⚠️ `ventana`, no `window`: una local con ese nombre tapa el global.
  const ventana = rangeWindow(range.from, range.to);

  React.useEffect(() => {
    // ⚠️ Un rango del revés no se pregunta: la respuesta vacía se leería como
    // «no pasó nada». DateRangeControl ya lo dice en pantalla.
    if (!agentId || !ventana) {
      setData(null);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    getDeviceActivity(agentId, { from: ventana.from, to: ventana.to, lane: lane === "all" ? undefined : lane })
      .then((res) => alive && setData(res?.activity ?? { events: [], sources: [] }))
      .catch((err) => {
        if (!alive) return;
        setData(null);
        setError(err?.body?.message || err?.message || "Could not load this device's activity.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [agentId, ventana?.from, ventana?.to, lane]);

  return (
    <Box>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
        What Tracenium <strong>sent</strong> to this device and what the agent <strong>observed</strong> on it. Times are
        shown in your timezone ({operatorTimeZone()}), which may not be the device&apos;s.
      </Typography>

      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
        <DateRangeControl from={range.from} to={range.to} onChange={setRange} />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={lane}
          onChange={(_, next) => next && setLane(next)}
          aria-label="Lane"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="sent">{LANE_LABEL.sent}</ToggleButton>
          <ToggleButton value="observed">{LANE_LABEL.observed}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <ActivityView data={data} loading={loading} error={error} />
    </Box>
  );
}
