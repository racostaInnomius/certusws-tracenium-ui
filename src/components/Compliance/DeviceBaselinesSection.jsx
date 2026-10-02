// src/components/Compliance/DeviceBaselinesSection.jsx
//
// ADR-0037 F1 — en la ficha del equipo: en qué baselines está y qué checks
// tiene fuera de línea. Si no está en ninguno, no se pinta nada (una caja
// vacía sería ruido en todos los equipos de un tenant sin baselines).

import * as React from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";
import { getDeviceBaselines } from "../../api/compliance";

export default function DeviceBaselinesSection({ agentId }) {
  const [baselines, setBaselines] = React.useState([]);

  React.useEffect(() => {
    if (!agentId) return undefined;
    let alive = true;
    setBaselines([]);
    // Sin poder leerlo, la sección no sale: no es la información principal
    // de la ficha y un error aquí no debe tapar lo demás.
    getDeviceBaselines(agentId)
      .then((res) => alive && setBaselines(Array.isArray(res?.baselines) ? res.baselines : []))
      .catch(() => alive && setBaselines([]));
    return () => {
      alive = false;
    };
  }, [agentId]);

  if (!baselines.length) return null;
  return (
    <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }} data-testid="device-baselines">
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
        <RuleOutlinedIcon sx={{ fontSize: ICON.md, color: BRAND.tealText }} />
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: BRAND.tealText, textTransform: "uppercase", letterSpacing: 0.8 }}>
          Baselines
        </Typography>
      </Stack>
      {baselines.map((b) => {
        const n = b.counts?.deviation ?? 0;
        const unmeasured = !b.aligned && n === 0;
        return (
          <Box key={b.id} sx={{ py: 0.75, borderTop: `1px solid ${BRAND.border}`, "&:first-of-type": { borderTop: "none" } }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, flex: 1 }}>{b.name}</Typography>
              <Chip
                size="small"
                label={n > 0 ? `${n} of ${b.checks} out of line` : unmeasured ? "Not measured yet" : "Aligned"}
                sx={{
                  height: 20,
                  fontSize: TEXT.xs,
                  fontWeight: 700,
                  bgcolor: n > 0 ? ROLE.criticalSoft : unmeasured ? BRAND.surfaceMuted : ROLE.positiveSoft,
                  color: n > 0 ? BRAND.alert.errorText : unmeasured ? BRAND.gray : BRAND.alert.successText,
                }}
              />
            </Stack>
            {n > 0 ? (
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.25 }}>
                {b.deviations.slice(0, 4).map((d) => d.title || d.checkId).join(" · ")}
                {b.deviations.length > 4 ? ` · +${b.deviations.length - 4} more` : ""}
              </Typography>
            ) : null}
          </Box>
        );
      })}
    </Paper>
  );
}
