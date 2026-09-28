// src/components/DeviceManagement/mdmAtoms.jsx
//
// Piezas pequeñas que comparten las pestañas de MDM / MAM.

import * as React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

// Relleno suave + texto oscuro del mismo matiz: los `*Text` pasan AA sobre
// su `*Soft` (ver theme/brand). Nunca el color de relleno como letra.
const TONES = {
  positive: { bg: BRAND.alert.successSoft, fg: BRAND.alert.successText },
  info: { bg: BRAND.alert.infoSoft, fg: BRAND.alert.infoText },
  caution: { bg: BRAND.alert.warningSoft, fg: BRAND.alert.warningText },
  critical: { bg: BRAND.alert.errorSoft, fg: BRAND.alert.errorText },
  muted: { bg: BRAND.darkSoft, fg: "text.secondary" },
};

export function StatusChip({ status, sx = null }) {
  const tone = TONES[status?.tone] ?? TONES.muted;
  return (
    <Chip
      size="small"
      label={status?.label ?? "—"}
      sx={{ height: 22, fontSize: TEXT.xs, fontWeight: 700, bgcolor: tone.bg, color: tone.fg, ...sx }}
    />
  );
}

/** Etiqueta / valor en columna, para cajones y bandas de estado. */
export function Field({ label, children, mono = false }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        component="div"
        sx={{
          color: BRAND.dark,
          fontWeight: 600,
          overflowWrap: "anywhere",
          ...(mono ? { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TEXT.sm } : {}),
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}
