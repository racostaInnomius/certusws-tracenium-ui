// src/components/Overview/SignalCoverageTile.jsx
//
// Una señal en una pieza fina: la del bloque Patching & crypto, una sobre cada
// card (parches encima de Patch Management, certificados encima de Crypto
// Discovery) para que los bordes casen con las cards de abajo.
//
// El texto del hueco es un enlace a la lista de esos equipos.

import * as React from "react";
import { Box, Link, LinearProgress, Stack, Typography } from "@mui/material";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { barColor, gapText } from "./signalCoverageModel";

export default function SignalCoverageTile({ signal, fleet, onOpenDevices }) {
  const blind = signal.blind > 0;
  return (
    <Box
      data-testid="signal-coverage-tile"
      sx={{
        height: "100%",
        border: "1px solid",
        borderColor: blind ? BRAND.alert.warning : BRAND.border,
        bgcolor: blind ? BRAND.alert.warningSoft : BRAND.surface,
        borderRadius: 2,
        px: 1.5,
        py: 1,
        minWidth: 0,
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
          {blind ? <VisibilityOffOutlinedIcon sx={{ fontSize: ICON.md, color: BRAND.alert.warningText }} /> : null}
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }} noWrap>
            {signal.label}
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", whiteSpace: "nowrap" }}>
          {signal.reporting}/{fleet} reporting
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, (signal.reporting / fleet) * 100)}
        color={barColor(signal)}
        sx={{ height: 5, borderRadius: 3, my: 0.5 }}
      />
      {blind ? (
        <Link
          component="button"
          type="button"
          underline="always"
          onClick={() => onOpenDevices?.(signal)}
          aria-label={`${gapText(signal)} — see which devices`}
          sx={{ fontSize: TEXT.xs, color: BRAND.alert.warningText, textAlign: "left", fontWeight: 700 }}
        >
          {gapText(signal)}
        </Link>
      ) : (
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{gapText(signal)}</Typography>
      )}
    </Box>
  );
}
