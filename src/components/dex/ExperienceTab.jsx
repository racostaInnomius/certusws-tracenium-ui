// src/components/dex/ExperienceTab.jsx
//
// ADR-0030 F3 — pestaña «Experience» de la ficha del equipo: CPU y memoria en
// el tiempo, crashes y caídas, arranque y batería, con las señales que el
// backend calculó y su evidencia.
//
// Lo que se dice sin que nadie pregunte:
//   · un hueco en la gráfica es un equipo apagado o dormido — no se rellena;
//   · si el agente no pudo leer los crashes, «ninguno» NO significa ninguno;
//   · un equipo que aún no informa dice «sin datos», no «todo bien».

import * as React from "react";
import { Alert, Box, Chip, CircularProgress, Grid, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { BRAND, ROLE, TEXT, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { formatDate, formatRelative } from "../../utils/format";
import { getDeviceExperience } from "../../api/dex";
import { EVENT_KIND_LABEL, SCOPE_NOTE, formatDuration, groupEvents, periodSummary, seriesWithGaps } from "./dexModel";

const RANGES = [
  { days: 1, label: "24 h" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];
const X_TICK = { fontSize: TEXT.xs };

function Stat({ label, value, helper }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${BRAND.border}`, height: "100%" }}>
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Typography>
      <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>{value}</Typography>
      {helper ? <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{helper}</Typography> : null}
    </Box>
  );
}

export default function ExperienceTab({ agentId }) {
  const [days, setDays] = React.useState(7);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!agentId) return undefined;
    let alive = true;
    setData(null);
    setError(null);
    getDeviceExperience(agentId, days)
      // La hora de la lectura va con los datos: el periodo se corta respecto a
      // ella, no a cada render.
      .then((res) => alive && setData({ ...(res?.device ?? { available: false }), loadedAt: Date.now() }))
      .catch((err) => alive && setError(err?.body?.message || err?.message || "Could not load experience data."));
    return () => {
      alive = false;
    };
  }, [agentId, days]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <CircularProgress size={22} sx={{ color: BRAND.teal }} />;
  if (!data.available) {
    return (
      <Alert severity="info" data-testid="dex-unavailable">
        No experience data from this device yet. Devices with the current agent report CPU, memory, crashes, boot time and battery once an hour.
      </Alert>
    );
  }

  const status = data.status ?? {};
  const scope = status.scope ?? {};
  const summary = periodSummary(data.windows);
  const series = seriesWithGaps(data.windows);
  const groups = groupEvents(data.events, data.loadedAt - days * 86_400_000);
  const battery = status.battery;
  const notes = ["events", "boot", "battery"].map((k) => SCOPE_NOTE[k]?.[scope[k]]).filter(Boolean);

  return (
    <Stack spacing={2} data-testid="dex-experience">
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
          Last report {formatRelative(status.lastReportAt)} · devices report once an hour
        </Typography>
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)} aria-label="Period">
          {RANGES.map((r) => (
            <ToggleButton key={r.days} value={r.days} sx={{ textTransform: "none", px: 1.5 }}>{r.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {data.signals.length ? (
        <Stack spacing={0.75} data-testid="dex-signals">
          {data.signals.map((s) => {
            const meta = severityMeta("medium");
            return (
              <Box key={s.key} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" label={s.label} sx={{ fontWeight: 800, fontSize: TEXT.xs, bgcolor: meta.bg, color: meta.fg }} />
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{s.evidence}</Typography>
              </Box>
            );
          })}
        </Stack>
      ) : (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.successText }} data-testid="dex-no-signals">
          No experience signals for this device.
        </Typography>
      )}

      {notes.map((n) => (
        <Alert key={n} severity="warning" sx={{ py: 0 }}>{n}</Alert>
      ))}

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="CPU" value={summary.cpuAvg == null ? "—" : `${summary.cpuAvg}% avg`} helper={summary.cpuPeak == null ? null : `peak ${summary.cpuPeak}%`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Memory" value={summary.memAvg == null ? "—" : `${summary.memAvg}% avg`} helper={summary.memPeak == null ? null : `peak ${summary.memPeak}%`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Last boot" value={formatDuration(status.bootDurationMs)} helper={status.lastBootUtc ? formatDate(status.lastBootUtc) : null} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat
            label="Battery"
            value={!battery ? "—" : !battery.present ? "No battery" : battery.healthPct == null ? "Present" : `${Math.round(battery.healthPct)}% health`}
            helper={battery?.present && battery.cycleCount != null ? `${battery.cycleCount} cycles` : null}
          />
        </Grid>
      </Grid>

      <Box>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>CPU and memory</Typography>
        {series.length > 1 ? (
          <Box sx={{ height: 220, width: "100%", minWidth: 0 }} data-testid="dex-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tick={X_TICK} tickFormatter={(t) => formatDate(new Date(t), days <= 1 ? { hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric" })} />
                <YAxis domain={[0, 100]} unit="%" width={44} tick={X_TICK} />
                <ChartTooltip labelFormatter={(t) => formatDate(new Date(t))} formatter={(v, name) => [v == null ? "—" : `${Math.round(v)}%`, name]} />
                <Area type="monotone" dataKey="cpuAvg" name="CPU (avg)" stroke={BRAND.teal} fill={BRAND.teal} fillOpacity={0.15} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                <Line type="monotone" dataKey="cpuMax" name="CPU (peak)" stroke={BRAND.teal} strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} connectNulls={false} />
                <Area type="monotone" dataKey="memAvg" name="Memory (avg)" stroke={ROLE.caution} fill={ROLE.caution} fillOpacity={0.08} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Not enough data for this period yet.</Typography>
        )}
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          15-minute averages. A gap means the device was off or asleep — it is not filled in.
        </Typography>
      </Box>

      <Box>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>Stability ({RANGES.find((r) => r.days === days)?.label})</Typography>
        {scope.events !== "collected" ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Unknown — see the note above.</Typography>
        ) : groups.apps.length === 0 && groups.system.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.successText }}>No crashes, hangs or system failures recorded.</Typography>
        ) : (
          <Stack spacing={0.5} data-testid="dex-events">
            {groups.system.map((e, i) => (
              <Typography key={`s${i}`} sx={{ fontSize: TEXT.sm, color: severityMeta("high").fg }}>
                {EVENT_KIND_LABEL[e.kind]} · {formatDate(e.occurredAtUtc)}{e.detail ? ` · ${e.detail}` : ""}
              </Typography>
            ))}
            {groups.apps.map((g) => (
              <Typography key={g.app} sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                <b>{g.app}</b> — {[g.crashes ? `${g.crashes} crash${g.crashes === 1 ? "" : "es"}` : null, g.hangs ? `${g.hangs} hang${g.hangs === 1 ? "" : "s"}` : null].filter(Boolean).join(", ")} · last {formatRelative(g.last)}
              </Typography>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
