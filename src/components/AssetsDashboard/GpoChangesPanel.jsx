// src/components/AssetsDashboard/GpoChangesPanel.jsx
//
// ADR-0012 (addendum) — qué directivas cambiaron, y en qué equipos.
//
// La tabla de arriba dice qué tiene cada equipo HOY. Esto dice qué cambió, que
// es lo que trae a alguien a esta pantalla: el 22-sep en T111 dos directivas
// entraron en tres equipos escalonadas entre las 18:51 y las 21:20, y esa
// forma —la misma directiva cayendo equipo a equipo a lo largo de una tarde—
// es la firma de una decisión tomada en el directorio.
//
// Lo que se dice sin que nadie pregunte:
//   · la directiva que SALE se cuenta igual que la que entra: que desaparezca
//     de un equipo suele ser un filtro que dejó de cumplirse, o una máquina
//     movida de sitio;
//   · la primera lectura de un equipo NO es un alta, y se dice cuántos equipos
//     están en esa situación para que el recuento se lea como un suelo.

import * as React from "react";
import { Alert, Box, Chip, CircularProgress, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { getWindowsGpoChanges } from "../../api/inventoryDashboard";

const RANGOS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const DIA_OPTS = { year: "numeric", month: "short", day: "numeric" };
const HORA_OPTS = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

function Fila({ group, onPickGpo }) {
  const entra = group.direction === "added";
  const equipos = group.devices.map((d) => d.hostname || d.agentId);
  const ventana =
    group.firstAt === group.lastAt
      ? formatDate(group.lastAt, HORA_OPTS)
      : `${formatDate(group.firstAt, HORA_OPTS)}–${formatDate(group.lastAt, HORA_OPTS)}`;

  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1, borderBottom: `1px solid ${BRAND.border}`, alignItems: "flex-start" }}>
      <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, minWidth: 108, pt: 0.3 }}>
        {formatDate(`${group.day}T12:00:00Z`, DIA_OPTS)}
      </Typography>
      <Chip
        size="small"
        label={entra ? "Started applying" : "Stopped applying"}
        sx={{
          height: 20,
          fontSize: TEXT.xs,
          fontWeight: 700,
          minWidth: 128,
          bgcolor: entra ? BRAND.alert.successSoft : BRAND.alert.warningSoft,
          color: entra ? BRAND.alert.successText : BRAND.alert.warningText,
          border: `1px solid ${entra ? BRAND.alert.successText : BRAND.alert.warningText}`,
        }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontSize: TEXT.md,
            fontWeight: 700,
            color: BRAND.dark,
            wordBreak: "break-word",
            cursor: onPickGpo ? "pointer" : "default",
            "&:hover": onPickGpo ? { textDecoration: "underline" } : undefined,
          }}
          onClick={onPickGpo ? () => onPickGpo(group.gpo) : undefined}
        >
          {group.gpo}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", wordBreak: "break-word" }}>
          {group.devices.length === 1 ? equipos[0] : `${group.devices.length} devices: ${equipos.join(", ")}`}
        </Typography>
        {/* La ventana del despliegue: una GPO no cae a la vez en todos, cada
            equipo la recoge cuando le toca refrescar. */}
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{ventana}</Typography>
      </Box>
    </Stack>
  );
}

/** Vista pura: así se prueban los vacíos sin tocar la red. */
export function GpoChangesView({ data, loading, error, onPickGpo }) {
  if (error) return <Alert severity="error">{error}</Alert>;
  if (loading || !data) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }} spacing={1}>
        <CircularProgress size={22} sx={{ color: BRAND.teal }} />
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading policy changes…</Typography>
      </Stack>
    );
  }

  const groups = data.groups || [];
  return (
    <Box>
      {groups.length === 0 ? (
        <Stack spacing={0.5} sx={{ py: 3 }}>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>
            No policy changes seen in this period.
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
            That means no device gained or lost a policy between two scans — not that the domain was untouched.
          </Typography>
        </Stack>
      ) : (
        groups.map((g) => <Fila key={`${g.gpo}|${g.direction}|${g.day}`} group={g} onPickGpo={onPickGpo} />)
      )}

      {/* ⚠️ El recuento es un suelo y se dice por qué. */}
      {data.devicesWithSingleReading > 0 ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 1.5 }}>
          {data.devicesWithSingleReading}{" "}
          {data.devicesWithSingleReading === 1 ? "device has" : "devices have"} a single reading in this period, so
          nothing can be compared for {data.devicesWithSingleReading === 1 ? "it" : "them"} — a device enrolled
          yesterday did not “gain” the policies of its first scan.
        </Typography>
      ) : null}
    </Box>
  );
}

export default function GpoChangesPanel({ onPickGpo }) {
  const [days, setDays] = React.useState(30);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    getWindowsGpoChanges(days)
      .then((res) => vivo && setData(res))
      .catch((err) => vivo && setError(err?.body?.message || err?.message || "Could not load policy changes."))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [days]);

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>Policy changes</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={days}
          onChange={(_, v) => v && setDays(v)}
          aria-label="Period"
        >
          {RANGOS.map((r) => (
            <ToggleButton key={r.days} value={r.days}>
              {r.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>
      <GpoChangesView data={data} loading={loading} error={error} onPickGpo={onPickGpo} />
    </Box>
  );
}
