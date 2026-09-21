// src/components/AssetsDashboard/HardwareChangesPanel.jsx
//
// Historial de cambios de hardware del equipo (memoria, discos, CPU, GPU,
// placa, identidad, BIOS), bajo la ficha de Hardware.
//
// ⚠️ Tres estados vacíos distintos, y decir el que es:
//   · el backend no tiene la detección      → no se enseña nada
//   · el equipo no tiene línea base todavía → "watching starts with the next inventory"
//   · vigilado sin cambios                  → "no changes since <fecha>"
// Un "sin cambios" sin fecha de inicio sería afirmar lo que no se sabe.

import * as React from "react";
import { Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { dashboardApi } from "../../api/dashboard";
import { formatDetailDate } from "./hostHelpers";

export const COMPONENT_LABEL = {
  identity: "Device identity",
  board: "Motherboard",
  cpu: "Processor",
  memory: "Memory",
  disks: "Disks",
  gpu: "Graphics",
  firmware: "BIOS / firmware",
};

export function HardwareChangesView({ data, loading, error }) {
  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <CircularProgress size={14} sx={{ color: BRAND.teal }} />
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading hardware changes…</Typography>
      </Stack>
    );
  }
  if (error) {
    return <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Could not load hardware changes.</Typography>;
  }
  if (!data || data.available === false) return null;

  const changes = Array.isArray(data.changes) ? data.changes : [];
  if (!data.baselineAt) {
    return (
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
        Not tracked yet — watching starts with this device's next hardware inventory.
      </Typography>
    );
  }
  if (changes.length === 0) {
    return (
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
        No hardware changes since {formatDetailDate(data.baselineAt)}.
      </Typography>
    );
  }
  return (
    <Stack spacing={1}>
      {changes.map((c) => (
        <Box
          key={c.id}
          sx={{ p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}
        >
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Chip
              size="small"
              label={COMPONENT_LABEL[c.component] || c.component}
              sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800 }}
            />
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
              {formatDetailDate(c.detectedAt)}
            </Typography>
          </Stack>
          <Typography sx={{ mt: 0.75, fontSize: TEXT.sm, color: "text.secondary", textDecoration: "line-through" }}>
            {c.before}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, fontWeight: 700 }}>{c.after}</Typography>
        </Box>
      ))}
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
        Tracked since {formatDetailDate(data.baselineAt)}.
      </Typography>
    </Stack>
  );
}

export default function HardwareChangesPanel({ agentId }) {
  const [state, setState] = React.useState({ data: null, loading: Boolean(agentId), error: false });

  React.useEffect(() => {
    if (!agentId) return undefined;
    let vivo = true;
    setState({ data: null, loading: true, error: false });
    dashboardApi
      .getHostHardwareChanges(agentId)
      .then((data) => vivo && setState({ data, loading: false, error: false }))
      .catch(() => vivo && setState({ data: null, loading: false, error: true }));
    return () => {
      vivo = false;
    };
  }, [agentId]);

  if (!agentId || (!state.loading && !state.error && state.data?.available === false)) return null;
  return (
    <Box sx={{ mt: 3 }}>
      <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Hardware changes</Typography>
      <Typography sx={{ mt: 0.25, mb: 1.5, fontSize: TEXT.sm, color: "text.secondary" }}>
        Physical components that changed between inventories. Failed reads and
        remote/virtual displays are ignored.
      </Typography>
      <HardwareChangesView {...state} />
    </Box>
  );
}
