// src/components/dex/ExperienceTimeline.jsx
//
// La cronología del equipo en la pestaña Experience: cuándo estuvo despierto y
// con qué carga, cuándo dormía, qué falló y cuándo se reinició — lo más
// reciente arriba, por días.
//
// Existe porque la primera vez que hizo falta (CLIFIJIMENEZlocal.local,
// 29-sep-2026: «ayer estuvo colgado y lento») hubo que sacarla de la base a
// mano. La gráfica tenía los números, pero no dejaba ver que el crash fue dos
// minutos antes del reinicio, ni distinguir un Mac dormido que despierta un
// momento de dos horas de uso.

import * as React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { EVENT_KIND_LABEL, buildTimeline, formatSpan } from "./dexModel";

const FIRST_ROWS = 40;
// ⚠️ `hourCycle: "h23"`, no `hour12: false`: con éste, algunas versiones de ICU
// pintan la medianoche como «24:34» — y el caso que dio origen a esto fue a las
// 00:34.
const HM = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
const DAY = { weekday: "short", month: "short", day: "numeric" };

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** «22:30 – 00:30» o, si cruza de día, «22:30 – Sep 29, 00:30». */
function spanLabel(t, end) {
  const from = formatDate(new Date(t), HM);
  if (end == null) return from;
  const to = dayKey(end) === dayKey(t) ? formatDate(new Date(end), HM) : formatDate(new Date(end), { month: "short", day: "numeric", ...HM });
  return `${from} – ${to}`;
}

const EVENT_TONE = {
  os_crash: BRAND.alert.errorText,
  unexpected_shutdown: BRAND.alert.errorText,
  app_crash: BRAND.alert.warningText,
  app_hang: BRAND.alert.warningText,
  restart: BRAND.dark,
};

function Row({ entry }) {
  let title;
  let body = null;
  let color = BRAND.dark;
  let muted = false;
  if (entry.type === "awake") {
    title = "Awake";
    const parts = [
      entry.cpuAvg == null ? null : `CPU ${entry.cpuAvg}% avg${entry.cpuPeak == null ? "" : ` (peak ${entry.cpuPeak}%)`}`,
      entry.memAvg == null ? null : `memory ${entry.memAvg}%${entry.memPeak == null ? "" : ` (peak ${entry.memPeak}%)`}`,
      formatSpan(entry.end - entry.t),
    ].filter(Boolean);
    body = parts.join(" · ");
  } else if (entry.type === "asleep") {
    title = "Asleep or off";
    muted = true;
    body = [
      entry.wakes ? `woke briefly ${entry.wakes} time${entry.wakes === 1 ? "" : "s"}` : "no data",
      formatSpan(entry.end - entry.t),
    ].join(" · ");
  } else {
    title = `${EVENT_KIND_LABEL[entry.kind] ?? entry.kind}${entry.app ? `: ${entry.app}` : ""}`;
    color = EVENT_TONE[entry.kind] ?? BRAND.dark;
    body = entry.detail;
  }
  return (
    <Box sx={{ display: "flex", gap: 1.5, py: 0.5, alignItems: "baseline" }} data-testid={`dex-tl-${entry.type}`}>
      <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums", minWidth: 128, flexShrink: 0 }}>
        {spanLabel(entry.t, entry.type === "event" ? null : entry.end)}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="span" sx={{ fontSize: TEXT.sm, fontWeight: entry.type === "event" ? 700 : 600, color: muted ? TEXT_MUTED : color }}>
          {title}
        </Typography>
        {/* Un espacio de verdad, no sólo margen: al copiar o con lector de
            pantalla, «AwakeCPU 41%» se leía pegado. */}
        {body ? " " : null}
        {body ? (
          <Typography component="span" sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, ml: 0.5, overflowWrap: "anywhere" }}>
            {body}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}

export default function ExperienceTimeline({ windows = [], events = [], fromMs = -Infinity }) {
  const [all, setAll] = React.useState(false);
  const entries = React.useMemo(() => buildTimeline(windows, events, fromMs), [windows, events, fromMs]);

  if (!entries.length) {
    return <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>No timeline for this period yet.</Typography>;
  }

  const shown = all ? entries : entries.slice(0, FIRST_ROWS);
  const days = [];
  for (const e of shown) {
    const k = dayKey(e.t);
    if (!days.length || days[days.length - 1].key !== k) days.push({ key: k, t: e.t, rows: [] });
    days[days.length - 1].rows.push(e);
  }

  return (
    <Box data-testid="dex-timeline">
      <Stack spacing={1}>
        {days.map((d) => (
          <Box key={d.key}>
            <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.4, mb: 0.25 }}>
              {formatDate(new Date(d.t), DAY)}
            </Typography>
            {d.rows.map((e, i) => (
              <Row key={`${e.type}-${e.t}-${i}`} entry={e} />
            ))}
          </Box>
        ))}
      </Stack>
      {entries.length > FIRST_ROWS ? (
        <Button size="small" onClick={() => setAll((v) => !v)} sx={{ textTransform: "none", mt: 0.5 }}>
          {all ? "Show fewer" : `Show all ${entries.length}`}
        </Button>
      ) : null}
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.75 }}>
        Your timezone. Built from 15-minute windows: a period counts as awake when the agent took at least half its
        samples. Restarts appear from devices whose agent reports them.
      </Typography>
    </Box>
  );
}
