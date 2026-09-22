// src/components/Overview/SignalCoverageStrip.jsx
//
// La franja que abre cada bloque del Overview: cuántos equipos reportan las
// señales de ESE bloque. Ver signalCoverageModel.js para el porqué.
//
// Sin señales para el bloque (plan, permiso `assets_view`, o la petición
// falló) no pinta nada: una franja vacía se leería como "todo bien".

import * as React from "react";
import { Box, Link, LinearProgress, Stack, Typography } from "@mui/material";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { barColor, gapText, signalsForBlock } from "./signalCoverageModel";
import SignalGapDrawer from "./SignalGapDrawer";

/**
 * @param coverage respuesta de /dashboard/signal-coverage, o null
 * @param block    bloque de resolveOverviewPlan: se pintan SUS señales
 */
export default function SignalCoverageStrip({ coverage, block, onNavigate }) {
  // La señal cuyo hueco se está mirando: "5 silent for over 3 days" abre la
  // lista de ESOS equipos (SignalGapDrawer).
  const [open, setOpen] = React.useState(null);
  const signals = signalsForBlock(coverage, block);
  const fleet = Number(coverage?.fleet) || 0;
  if (!signals.length || !fleet) return null;
  const anyBlind = signals.some((s) => s.blind > 0);

  return (
    <Box
      data-testid="signal-coverage-strip"
      sx={{
        border: "1px solid",
        borderColor: anyBlind ? BRAND.alert.warning : BRAND.border,
        bgcolor: anyBlind ? BRAND.alert.warningSoft : BRAND.surface,
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: `repeat(${signals.length}, minmax(0, 1fr))` },
        gap: 2,
      }}
    >
      {signals.map((s) => (
        <Box key={s.key} sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
              {s.blind > 0 ? (
                <VisibilityOffOutlinedIcon sx={{ fontSize: ICON.md, color: BRAND.alert.warningText }} />
              ) : null}
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }} noWrap>
                {s.label}
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", whiteSpace: "nowrap" }}>
              {s.reporting}/{fleet} reporting
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (s.reporting / fleet) * 100)}
            color={barColor(s)}
            sx={{ height: 5, borderRadius: 3, my: 0.5 }}
          />
          {s.blind > 0 ? (
            <Link
              component="button"
              type="button"
              underline="always"
              onClick={() => setOpen(s)}
              aria-label={`${gapText(s)} — see which devices`}
              sx={{ fontSize: TEXT.xs, color: BRAND.alert.warningText, textAlign: "left", fontWeight: 700 }}
            >
              {gapText(s)}
            </Link>
          ) : (
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{gapText(s)}</Typography>
          )}
        </Box>
      ))}
      <SignalGapDrawer signal={open} open={Boolean(open)} onClose={() => setOpen(null)} onNavigate={onNavigate} />
    </Box>
  );
}
