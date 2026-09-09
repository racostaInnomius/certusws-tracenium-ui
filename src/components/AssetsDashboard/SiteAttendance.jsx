// Quién estuvo en un sitio, y cuándo (ADR-0018 fase 3).
//
// La pregunta que el drawer no puede contestar: el drawer va de UN equipo, y
// ésta va de un SITIO y una fecha.
//
// ⚠️ Tres cosas que esta vista tiene que decir y que el formato invita a callar:
//
//   1. Las horas son de OBSERVACIÓN, no de entrada y salida. Cada estancia
//      trae hasta cuándo se confirmó al equipo allí y cuándo se supo que ya no
//      estaba; entre ambas hay un hueco del tamaño de la cadencia de reporte
//      (~1,1 h en un tenant, ~9,7 h en el más grande).
//   2. Un mismo equipo puede salir varias veces. Entró, salió y volvió son
//      estancias distintas, y agruparlas escondería justo lo que se viene a ver.
//   3. Una fecha anterior a la retención NO devuelve una lista vacía: dice que
//      el dato caducó. Una lista vacía se leería como "ese día no estuvo nadie",
//      que es una afirmación sobre el paradero de personas.

import * as React from "react";
import { Box, Chip, Stack, TextField, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { formatDetailDate, departureText } from "./hostHelpers";

export default function SiteAttendance({ siteName, data, loading, date, onDateChange }) {
  const episodes = Array.isArray(data?.episodes) ? data.episodes : [];

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1, flexWrap: "wrap", rowGap: 1 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
          Who was at {siteName}
        </Typography>
        <TextField
          size="small"
          type="date"
          label="On"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 170 }}
        />
        {!loading && data ? (
          <Chip
            size="small"
            // ⚠️ Equipos distintos, no estancias: un equipo que entró y salió
            // dos veces es UN equipo, y contar estancias inflaría la cifra que
            // un operador lee de un vistazo.
            label={`${data.deviceCount ?? 0} device${(data.deviceCount ?? 0) === 1 ? "" : "s"}`}
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
          />
        ) : null}
      </Stack>

      {loading ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading…</Typography>
      ) : data?.beyondRetention ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.warningText }}>
          {/* ⚠️ Caducado NO es vacío. Devolver una lista vacía aquí sería
              afirmar que nadie estuvo, cuando lo cierto es que ya no se
              guarda. */}
          Stays are only kept for {data.retentionDays} days, so that date is no longer stored —
          this is not the same as nobody having been here. Data starts from{" "}
          {formatDetailDate(data.retentionFloor)}.
        </Typography>
      ) : episodes.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          No device was recorded at this site that day. Devices are only recorded when they check
          in, so a device that was here but never reported does not appear.
        </Typography>
      ) : (
        <Stack spacing={0.5}>
          {episodes.map((ep) => (
            <Stack key={ep.id} direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, minWidth: 160 }}>
                {ep.hostname || ep.agentId}
              </Typography>
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                confirmed {formatDetailDate(ep.firstSeenAt)} – {formatDetailDate(ep.lastSeenAt)}
              </Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", fontStyle: "italic" }}>
                {departureText(ep)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}
