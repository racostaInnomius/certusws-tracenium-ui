// src/components/dex/ExperienceFleetCard.jsx
//
// ADR-0030 F3 — la flota en el Dashboard de Asset Management: cuántos equipos
// informan, el recuento por señal y los equipos con señales. Al pulsar uno se
// abre su ficha en la pestaña Experience.
//
// Señales, no una nota: cada equipo lleva sus señales con la evidencia. Y se
// dice cuántos equipos no pudieron leer sus crashes — su «sin señales» es «no
// lo sabemos».

import * as React from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { getFleetExperience } from "../../api/dex";

const COLLAPSED = 6;

export default function ExperienceFleetCard({ refreshNonce = 0, onOpenDevice }) {
  const [fleet, setFleet] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [filter, setFilter] = React.useState(null);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    getFleetExperience()
      .then((res) => {
        if (!alive) return;
        setFleet(res?.fleet ?? null);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  // Sin la función desplegada, o sin ningún equipo que informe todavía, la
  // tarjeta no ocupa sitio en el dashboard.
  if (failed || !fleet || !fleet.reporting) return null;

  const devices = filter ? fleet.devices.filter((d) => d.signals.some((s) => s.key === filter)) : fleet.devices;
  const shown = expanded ? devices : devices.slice(0, COLLAPSED);
  const warn = severityMeta("medium");

  return (
    <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }} data-testid="dex-fleet-card">
      <Stack spacing={1.25}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <SpeedOutlinedIcon sx={{ color: BRAND.teal }} />
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>Device experience</Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
            {fleet.withSignals} of {fleet.reporting} reporting device{fleet.reporting === 1 ? "" : "s"} with signals · last 24 h (CPU, memory) and 7 days (crashes)
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          {fleet.counts.filter((c) => c.devices > 0).map((c) => (
            <Chip
              key={c.key}
              size="small"
              label={`${c.label} · ${c.devices}`}
              onClick={() => setFilter((f) => (f === c.key ? null : c.key))}
              variant={filter === c.key ? "filled" : "outlined"}
              data-testid={`dex-count-${c.key}`}
              sx={{ fontSize: TEXT.xs, fontWeight: 700, ...(filter === c.key ? { bgcolor: warn.bg, color: warn.fg } : { borderColor: BRAND.border }) }}
            />
          ))}
        </Box>

        {fleet.withSignals === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.successText }}>No device shows experience signals.</Typography>
        ) : (
          <Stack spacing={0.5} data-testid="dex-fleet-devices">
            {shown.map((d) => (
              <Box
                key={d.agentId}
                role="button"
                tabIndex={0}
                onClick={() => onOpenDevice?.(d.agentId, d.hostname)}
                onKeyDown={(e) => (e.key === "Enter" ? onOpenDevice?.(d.agentId, d.hostname) : null)}
                sx={{ display: "flex", gap: 1, alignItems: "baseline", flexWrap: "wrap", px: 1, py: 0.5, borderRadius: 1, cursor: "pointer", "&:hover": { bgcolor: BRAND.tealSoft } }}
              >
                <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, minWidth: 140 }}>{d.hostname || d.agentId}</Typography>
                <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>{d.signals.map((s) => `${s.label}: ${s.evidence}`).join(" · ")}</Typography>
              </Box>
            ))}
            {devices.length > COLLAPSED ? (
              <Box>
                <Button size="small" onClick={() => setExpanded((v) => !v)} sx={{ textTransform: "none" }}>
                  {expanded ? "Show fewer" : `Show all ${devices.length}`}
                </Button>
              </Box>
            ) : null}
          </Stack>
        )}

        {fleet.eventsNotCollected > 0 ? (
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }} data-testid="dex-events-blind">
            {fleet.eventsNotCollected} reporting device{fleet.eventsNotCollected === 1 ? "" : "s"} could not read crash logs — for them, “no signals” means “unknown”, not “stable”.
          </Typography>
        ) : null}
      </Stack>
    </SectionPaper>
  );
}
