// src/components/Overview/SignalGapDrawer.jsx
//
// QUIÉNES son los equipos de "5 silent for over 3 days". Una cifra sin nombres
// deja al operador sin nada que hacer; aquí cada fila abre la ficha del equipo
// en Asset Management (`?page=assets&device=<id>`).
//
// La lista sale del mismo padrón y umbral que la cifra de la franja
// (`/dashboard/signal-coverage/:signal/devices`), así que cuadran.

import * as React from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { dashboardApi } from "../../api/dashboard";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { gapReason } from "./signalCoverageModel";

export default function SignalGapDrawer({ signal, open, onClose, onNavigate }) {
  const [state, setState] = React.useState({ loading: false, error: null, data: null });

  React.useEffect(() => {
    if (!open || !signal) return undefined;
    let vivo = true;
    setState({ loading: true, error: null, data: null });
    dashboardApi
      .getSignalGapDevices(signal.key)
      .then((data) => vivo && setState({ loading: false, error: null, data }))
      .catch((e) => vivo && setState({ loading: false, error: e?.body?.error || e?.message || "Failed to load", data: null }));
    return () => {
      vivo = false;
    };
  }, [open, signal]);

  const devices = state.data?.devices ?? [];

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 440 } } }}>
      <Box sx={{ p: 2 }} role="region" aria-label={signal ? `${signal.label} — devices not reporting` : "Devices not reporting"}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
              {signal?.label ?? "Signal"}
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              Devices that never sent this signal, or have been silent for over {signal?.staleAfterDays ?? "?"} days.
            </Typography>
          </Box>
          <IconButton aria-label="Close" onClick={onClose} size="small">
            <CloseRoundedIcon sx={{ fontSize: ICON.lg }} />
          </IconButton>
        </Stack>

        <Box sx={{ mt: 2 }}>
          {state.loading ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} sx={{ color: BRAND.teal }} />
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading devices…</Typography>
            </Stack>
          ) : state.error ? (
            <Alert severity="error">Could not load the devices: {state.error}</Alert>
          ) : devices.length === 0 ? (
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              Every device is reporting this signal now.
            </Typography>
          ) : (
            <>
              <List disablePadding sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 1 }}>
                {devices.map((d, i) => (
                  <ListItemButton
                    key={d.agentId}
                    divider={i < devices.length - 1}
                    onClick={() => {
                      onClose?.();
                      onNavigate?.("assets", { device: d.agentId });
                    }}
                  >
                    <ListItemText
                      primary={d.hostname || d.agentId}
                      secondary={gapReason(d)}
                      primaryTypographyProps={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, noWrap: true }}
                      secondaryTypographyProps={{ fontSize: TEXT.xs, title: d.lastReportAt ? formatDate(d.lastReportAt) : undefined }}
                    />
                    <Chip
                      size="small"
                      label={d.reason === "never" ? "Never" : "Silent"}
                      sx={{
                        mr: 0.5,
                        height: 20,
                        fontSize: TEXT.xs,
                        fontWeight: 700,
                        bgcolor: BRAND.alert.warningSoft,
                        color: BRAND.alert.warningText,
                      }}
                    />
                    <ChevronRightRoundedIcon sx={{ fontSize: ICON.md, color: "text.secondary" }} />
                  </ListItemButton>
                ))}
              </List>
              {state.data?.truncated ? (
                <Typography sx={{ mt: 1, fontSize: TEXT.xs, color: "text.secondary" }}>
                  Showing the first {devices.length} devices.
                </Typography>
              ) : null}
            </>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
