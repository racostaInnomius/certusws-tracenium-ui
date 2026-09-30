// src/components/inventory/BehindNewestCard.jsx
//
// «Behind the newest version»: por app, cuántos equipos NO tienen la versión
// más alta que se ve en la flota. Sustituye a «Version fragmentation», que
// contaba versiones distintas: «RingCentral, 13 versiones» no dice si el
// problema son 2 equipos o 28. Esto sí: 20 de 30.
//
// «Más nueva» es la más alta de ESTA flota (behindNewestCtes en el backend),
// no la del fabricante, y el subtítulo lo dice.

import * as React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { SOFTWARE_ACCENTS } from "../../theme/chartPalette";

const ON_NEWEST = `${BRAND.teal}66`;

function Swatch({ color, label }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: color }} />
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{label}</Typography>
    </Stack>
  );
}

export default function BehindNewestCard({ rows = [], maxItems = 5, headerExtra = null, onSelect, activeLabel = null }) {
  const shown = rows.slice(0, maxItems);
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: "100%",
        minHeight: 260,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>Behind the newest version</Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
        Devices not on the newest version seen in your fleet
      </Typography>
      {headerExtra ? <Box sx={{ mt: 0.5 }}>{headerExtra}</Box> : null}

      {shown.length === 0 ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>Every app is on its newest version</Typography>
        </Box>
      ) : (
        <Stack spacing={1.25} sx={{ mt: 1.25 }}>
          {shown.map((r) => {
            const devices = Number(r.deviceCount || 0);
            const behind = Number(r.behind || 0);
            const pct = devices > 0 ? (behind / devices) * 100 : 0;
            const active = activeLabel === r.label;
            return (
              <Box
                key={r.label}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={`${r.label}: ${behind} of ${devices} devices behind`}
                aria-pressed={onSelect ? active : undefined}
                onClick={onSelect ? () => onSelect(r.label) : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(r.label);
                        }
                      }
                    : undefined
                }
                sx={{
                  cursor: onSelect ? "pointer" : "default",
                  borderRadius: 1.5,
                  mx: -0.75,
                  px: 0.75,
                  py: 0.25,
                  bgcolor: active ? BRAND.tealSoft : "transparent",
                  "&:hover": onSelect ? { bgcolor: BRAND.surfaceMuted } : undefined,
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                  <Typography
                    title={r.label}
                    sx={{ fontWeight: 700, fontSize: TEXT.sm, color: BRAND.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {r.label}
                  </Typography>
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, whiteSpace: "nowrap" }}>
                    <b>{behind}</b>
                    <Box component="span" sx={{ color: "text.secondary" }}> of {devices}</Box>
                  </Typography>
                </Stack>
                <Box sx={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", bgcolor: BRAND.border, mt: 0.5 }}>
                  <Box sx={{ width: `${pct}%`, bgcolor: SOFTWARE_ACCENTS.drift }} />
                  <Box sx={{ width: `${100 - pct}%`, bgcolor: ON_NEWEST }} />
                </Box>
                {r.newest ? (
                  <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 0.25 }}>newest {r.newest}</Typography>
                ) : null}
              </Box>
            );
          })}
        </Stack>
      )}

      <Stack direction="row" spacing={2} sx={{ mt: "auto", pt: 1.5 }}>
        <Swatch color={SOFTWARE_ACCENTS.drift} label="behind" />
        <Swatch color={ON_NEWEST} label="on newest" />
      </Stack>
    </Paper>
  );
}
