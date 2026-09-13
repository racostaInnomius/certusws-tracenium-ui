// src/components/Assessments/StatusChip.jsx
//
// Un chip de estado con los tonos de ROLE. Instancias, corridas y veredictos
// usan el mismo, así «Missed» y «Fail» se leen igual de rojos en toda la página.

import * as React from "react";
import { Chip, Tooltip } from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

const TONES = {
  positive: { fg: ROLE.positive, bg: ROLE.positiveSoft },
  caution: { fg: BRAND.alert.warningText ?? ROLE.caution, bg: ROLE.cautionSoft },
  critical: { fg: BRAND.alert.errorText ?? ROLE.critical, bg: ROLE.criticalSoft },
  neutral: { fg: BRAND.tealText, bg: ROLE.neutralSoft },
  muted: { fg: BRAND.dark, bg: BRAND.darkSoft },
};

export default function StatusChip({ meta, fallback = "—", help = null }) {
  if (!meta) return <span>{fallback}</span>;
  const tone = TONES[meta.tone] || TONES.muted;
  const chip = (
    <Chip
      size="small"
      label={meta.label}
      sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 800, color: tone.fg, bgcolor: tone.bg }}
    />
  );
  const text = help ?? meta.help ?? null;
  return text ? (
    <Tooltip title={text} arrow>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}

/**
 * Colores explícitos para los avisos de la página. Con el tema actual,
 * `palette.<severity>.light` es un rgba translúcido y el <Alert> estándar de MUI
 * deriva de él un texto al 22 % de opacidad: el aviso de «corrida missed», que es
 * justo lo que el ADR exige que se VEA, salía casi invisible.
 */
export function bannerSx(severity) {
  const map = {
    error: { fg: BRAND.alert.errorText ?? ROLE.critical, bg: ROLE.criticalSoft },
    warning: { fg: BRAND.alert.warningText ?? ROLE.caution, bg: ROLE.cautionSoft },
    info: { fg: BRAND.tealText, bg: ROLE.neutralSoft },
    success: { fg: ROLE.positive, bg: ROLE.positiveSoft },
  };
  const t = map[severity] || map.info;
  return { color: t.fg, bgcolor: t.bg, "& .MuiAlert-icon": { color: t.fg }, "& .MuiAlert-message": { color: t.fg } };
}

