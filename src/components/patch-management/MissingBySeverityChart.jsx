// src/components/patch-management/MissingBySeverityChart.jsx
//
// El segundo chart de la fila «Start here»: cuánto trabajo pendiente hay y de
// qué tipo. Acompaña al donut, que cuenta EQUIPOS; éste cuenta PARCHES (ver
// missingBySeverity.js).
//
// ⚠️ MISMO BLOQUE DE CABECERA QUE «Start here» Y QUE EL DONUT (título grande +
// apunte pequeño, `mb: 1.5`) y mismo `SectionPaper` con `flex: 1`: así los tres
// paneles de la fila empiezan y acaban a la misma altura sin un solo margen
// puesto a ojo.
//
// Barras y no otro donut: son cinco valores muy desiguales sobre un total, y
// una barra los compara de un vistazo. Además el número va SIEMPRE escrito al
// lado — el color es la segunda codificación, nunca la primera.

import * as React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { missingBySeverityData } from "./missingBySeverity";

// Mismos rellenos que el donut para los tonos compartidos: critical es
// `errorText` (#B23A33) y no el rojo suave, que contra el verde positivo se
// separa ΔE 3,1 para un deuteránope — es decir, nada.
const FILL = {
  critical: BRAND.alert.errorText,
  caution: ROLE.caution,
  info: BRAND.teal,
  muted: BRAND.gray,
};

export default function MissingBySeverityChart({ severityBreakdown }) {
  const data = React.useMemo(() => missingBySeverityData(severityBreakdown), [severityBreakdown]);

  const frame = (children) => (
    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
      {/* Una sola línea, por lo mismo que en PatchStatusDonut. */}
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.5, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark, flexShrink: 0 }}>
          Pending work
        </Typography>
        <Typography noWrap sx={{ fontSize: TEXT.xs, color: "text.secondary", minWidth: 0 }}>
          Missing OS patches by severity
        </Typography>
      </Stack>
      <SectionPaper variant="panel" sx={{ p: 2, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {children}
      </SectionPaper>
    </Box>
  );

  if (data.total === 0) {
    return frame(
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
        No device is reporting a missing OS patch.
      </Typography>
    );
  }

  return frame(
    <>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: TEXT["3xl"], fontWeight: 800, color: BRAND.dark, lineHeight: 1 }}>
          {data.total.toLocaleString()}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          patches waiting across the fleet
        </Typography>
      </Stack>

      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1.25 }}>
        {data.bands.map((band) => (
          <Box component="li" key={band.key}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, flex: 1, minWidth: 0 }}>{band.label}</Typography>
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>
                {band.value.toLocaleString()}
              </Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", width: 34, textAlign: "right" }}>
                {Math.round(band.pct)}%
              </Typography>
            </Stack>
            {/* La pista gris da la escala: sin ella una barra corta y una banda
                pequeña se leen igual. */}
            <Box sx={{ height: 8, borderRadius: 1, bgcolor: BRAND.surfaceMuted, overflow: "hidden" }}>
              <Box
                sx={{
                  height: "100%",
                  // Un valor > 0 nunca desaparece: mejor una marca mínima que
                  // una barra vacía que parece un 0.
                  width: `${band.value > 0 ? Math.max(band.pct, 1.5) : 0}%`,
                  bgcolor: FILL[band.tone] ?? BRAND.gray,
                  borderRadius: 1,
                }}
              />
            </Box>
          </Box>
        ))}
      </Box>

      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 2 }}>
        <Tooltip
          arrow
          placement="top"
          title="One item per patch a device is missing, so a single device contributes as many as it owes. Third-party applications are not counted here — they live in Vulnerabilities and Software."
        >
          <Box component="span" sx={{ cursor: "help", borderBottom: `1px dotted ${BRAND.gray}` }}>
            {data.topShare}% of the backlog is critical or important
          </Box>
        </Tooltip>
      </Typography>
    </>
  );
}
