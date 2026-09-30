// src/components/Billing/StatusPill.jsx
//
// La pastilla de estado de Billing (plan, factura, complemento).
//
// Texto con los tokens *Text de brand.js y fondo con los *Soft: el color de
// RELLENO (ROLE.*) como texto no llega a 4,5:1 — el ámbar sobre blanco se
// quedaba en ~1,5:1.

import { Box } from "@mui/material";
import { BRAND, ROLE, TEXT, TEXT_MUTED } from "../../theme/brand";

const TONES = {
  success: { fg: BRAND.alert.successText, bg: ROLE.positiveSoft },
  info: { fg: BRAND.alert.infoText, bg: ROLE.neutralSoft },
  warning: { fg: BRAND.alert.warningText, bg: ROLE.cautionSoft },
  error: { fg: BRAND.alert.errorText, bg: ROLE.criticalSoft },
  neutral: { fg: TEXT_MUTED, bg: BRAND.darkSoft },
};

export default function StatusPill({ tone = "neutral", children, sx = null }) {
  const { fg, bg } = TONES[tone] ?? TONES.neutral;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        fontSize: TEXT.xs,
        fontWeight: 800,
        lineHeight: 1.6,
        color: fg,
        bgcolor: bg,
        borderRadius: 999,
        px: 1,
        whiteSpace: "nowrap",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
