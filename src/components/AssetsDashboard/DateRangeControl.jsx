// Elegir UN día o un RANGO, con el suelo de retención puesto en el control.
//
// ⚠️ EL SUELO NO ES DECORACIÓN. Las estancias se borran a los 30 días, así que
// un rango que empieza antes no devuelve "nadie estuvo": devuelve un hueco que
// ya no existe. El `min` del campo lo impide antes de preguntar, y cuando la
// respuesta ya venía caducada, quien la pinta lo dice con todas las letras.
//
// Los atajos son la forma normal de usarlo —"la última semana"— y el par de
// fechas queda para la pregunta concreta. Sin atajos, mirar treinta días
// costaba treinta consultas de un día.

import * as React from "react";
import { Chip, Stack, TextField, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { lastDaysRange } from "./hostHelpers";

const ATAJOS = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

/** El día del suelo de retención en formato de `<input type="date">`. */
export function retentionFloorDay(retentionFloor) {
  if (!retentionFloor) return undefined;
  const t = Date.parse(retentionFloor);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : undefined;
}

export default function DateRangeControl({
  from,
  to,
  onChange,
  retentionFloor = null,
  size = "small",
  label = "",
}) {
  const min = retentionFloorDay(retentionFloor);
  const activo = ATAJOS.find((a) => {
    const r = lastDaysRange(a.days);
    return r.from === from && r.to === to;
  });
  // ⚠️ Un rango invertido no se manda: preguntar "del 10 al 3" devolvería una
  // lista vacía indistinguible de "no estuvo en ningún sitio".
  const invertido = Boolean(from && to && from > to);

  return (
    <Stack spacing={0.75} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
        {label ? (
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{label}</Typography>
        ) : null}
        <TextField
          size={size}
          type="date"
          label="From"
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min, max: to || undefined } }}
          sx={{ width: 165 }}
        />
        <TextField
          size={size}
          type="date"
          label="To"
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from || min } }}
          sx={{ width: 165 }}
        />
        {ATAJOS.map((a) => (
          <Chip
            key={a.label}
            size="small"
            label={a.label}
            onClick={() => onChange(lastDaysRange(a.days))}
            aria-pressed={activo?.label === a.label}
            sx={{
              height: 24,
              fontSize: TEXT.xs,
              fontWeight: 700,
              bgcolor: activo?.label === a.label ? BRAND.tealSoft : "transparent",
              color: activo?.label === a.label ? BRAND.tealText : "text.secondary",
              border: `1px solid ${activo?.label === a.label ? BRAND.tealText : BRAND.border}`,
            }}
          />
        ))}
      </Stack>
      {invertido ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.errorText }}>
          The end date is before the start date, so nothing was looked up.
        </Typography>
      ) : null}
    </Stack>
  );
}
