// src/components/Assets/SignalCoverageCard.jsx
//
// "¿De cuántos equipos no sabemos nada?"
//
// Todas las pantallas del producto responden sobre los equipos que reportan y
// callan sobre los que no. Un equipo que dejó de mandar postura hace tres
// semanas no sale como "en riesgo": desaparece — y desaparecer se lee como que
// no hay problema. Esta tarjeta cuenta justo lo que las demás no enseñan.
//
// Dos cosas que NO hace, y que son las que la hacen creíble:
//
//   · No llama hueco a lo que el cliente no ha comprado. Una señal sin plan se
//     etiqueta "not in plan" y no suma a la ceguera; meterla en la misma cifra
//     convertiría el plan en una alarma y la pantalla en algo que se ignora.
//   · No suma equipos entre señales para el titular: el mismo portátil suele
//     estar callado en varias, y sumar diría más equipos de los que hay.
//
// Es la mitad complementaria del descubrimiento de AD (qué equipos del dominio
// no tienen agente). Aquella cuenta lo que falta fuera; ésta, lo que falta
// dentro.

import * as React from "react";
import {
  Alert, Box, Chip, CircularProgress, LinearProgress, Stack, Tooltip, Typography,
} from "@mui/material";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import SectionPaper from "../common/SectionPaper";
import { dashboardApi } from "../../api/dashboard";

/** El texto del hueco. Distingue "nunca" de "hace mucho": no son el mismo problema. */
export function gapText(signal) {
  if (!signal.entitled) return "Not in plan — nothing is expected from these devices.";
  if (signal.blind === 0) return "Every device is reporting.";
  const parts = [];
  if (signal.never > 0) parts.push(`${signal.never} never reported`);
  if (signal.stale > 0) parts.push(`${signal.stale} silent for over ${signal.staleAfterDays} days`);
  return parts.join(" · ");
}

/** Verde no es "0 huecos": es "0 huecos Y algo que contar". */
export function barColor(signal) {
  if (!signal.entitled) return "inherit";
  if (signal.blindPct >= 25) return "error";
  if (signal.blindPct > 0) return "warning";
  return "success";
}

export default function SignalCoverageCard({ refreshNonce }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await dashboardApi.getSignalCoverage();
        if (alive) setData(res);
      } catch (e) {
        if (alive) setError(e?.body?.error || e?.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshNonce]);

  if (loading && !data) {
    return (
      <SectionPaper variant="panel" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={16} />
          <Typography sx={{ color: "text.secondary" }}>Checking what we can't see…</Typography>
        </Stack>
      </SectionPaper>
    );
  }

  if (error) {
    return (
      <SectionPaper variant="panel" sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </SectionPaper>
    );
  }

  const signals = data?.signals ?? [];
  const fleet = data?.fleet ?? 0;
  const anyGap = data?.devicesWithAnyGap ?? 0;

  return (
    <SectionPaper variant="panel" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <VisibilityOffOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
        <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>
          Blind spots
        </Typography>
      </Stack>

      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 2 }}>
        {fleet === 0 ? (
          "No managed devices yet."
        ) : (
          <>
            <strong>{anyGap}</strong> of <strong>{fleet}</strong> managed devices are missing at
            least one signal. Every other screen is silent about them.
          </>
        )}
      </Typography>

      <Stack spacing={1.75}>
        {signals.map((s) => (
          <Box key={s.key}>
            <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between">
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Typography sx={{ fontSize: TEXT.base, fontWeight: 700 }}>{s.label}</Typography>
                {!s.entitled ? (
                  <Tooltip title="This plugin is not part of the tenant's plan, so these devices are not expected to report it. It is not counted as a blind spot.">
                    <Chip size="small" variant="outlined" label="not in plan" />
                  </Tooltip>
                ) : null}
              </Stack>
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                {s.entitled ? `${s.reporting}/${fleet} reporting` : "—"}
              </Typography>
            </Stack>

            <LinearProgress
              variant="determinate"
              value={fleet > 0 && s.entitled ? Math.min(100, (s.reporting / fleet) * 100) : 0}
              color={barColor(s)}
              sx={{ height: 6, borderRadius: 3, my: 0.5, opacity: s.entitled ? 1 : 0.35 }}
            />

            <Typography sx={{ fontSize: TEXT.sm, color: s.blind > 0 ? BRAND.alert.warningText : "text.secondary" }}>
              {gapText(s)}
            </Typography>
          </Box>
        ))}
      </Stack>
    </SectionPaper>
  );
}
