// src/components/AssetGroups/criticality.jsx
//
// La criticidad de negocio de un grupo de activos: critical | high | low, o
// null (sin declarar = normal). Un equipo hereda la MÁS ALTA de sus grupos.
//
// Lo que NO hace, y la pantalla no debe insinuar: no cambia la severidad de
// un hallazgo ni el score de un CVE. Sólo decide, a igual gravedad, qué se
// arregla primero, y señala cuánto de lo que está mal cae en equipos críticos.

import * as React from "react";
import { Chip, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

export const CRITICALITY_OPTIONS = [
  { value: "", label: "Normal (not set)", help: "Default. Ranks by severity and device count only." },
  { value: "critical", label: "Critical", help: "Domain controllers, production servers, anything whose loss stops the business." },
  { value: "high", label: "High", help: "Important, but the business keeps running without it for a while." },
  { value: "low", label: "Low", help: "Labs, spares, kiosks. Ranks after normal devices at equal severity." },
];

const TONE = {
  critical: { label: "Critical", bg: BRAND.alert.errorSoft, color: BRAND.alert.errorText },
  high: { label: "High", bg: BRAND.alert.highSoft, color: BRAND.alert.high },
  low: { label: "Low", bg: BRAND.surfaceMuted, color: BRAND.gray },
};

export function CriticalityChip({ value, emptyAsDash = false }) {
  const tone = TONE[value];
  if (!tone) {
    if (!emptyAsDash) return null;
    return (
      <Tooltip title="No criticality set — ranks as a normal device">
        <Typography sx={{ fontSize: TEXT.base, color: BRAND.gray }}>—</Typography>
      </Tooltip>
    );
  }
  return (
    <Chip
      size="small"
      label={tone.label}
      sx={{ bgcolor: tone.bg, color: tone.color, fontWeight: 700 }}
    />
  );
}
