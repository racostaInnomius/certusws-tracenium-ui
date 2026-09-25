// src/components/AssetsDashboard/AssetAttentionCard.jsx
//
// "Needs attention" — lo accionable del hardware y del SO, junto a Device
// experience. Mismo formato que OS versions (fila, cifra, barra) para que la
// columna se lea igual de arriba abajo.
//
// Las cinco filas salen SIEMPRE, también a cero: "0 equipos sin soporte" es
// una respuesta, y una tarjeta que cambia de forma según los datos obliga a
// leerla de nuevo cada vez.

import * as React from "react";
import { Box, ButtonBase, Chip, Paper, Stack, Typography } from "@mui/material";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { BRAND, FOCUS_RING, ICON, ROLE, TEXT } from "../../theme/brand";
import { attentionRows } from "./assetHealthModel";

const TONE_FILL = { critical: ROLE.critical, caution: ROLE.caution };

function Row({ row, onOpen }) {
  const zero = row.count === 0;
  const fill = zero ? BRAND.gray : TONE_FILL[row.tone] ?? BRAND.teal;
  const clickable = !zero && Boolean(row.fleetFilter) && typeof onOpen === "function";

  const body = (
    <Box sx={{ width: "100%", textAlign: "left" }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
        <Typography
          sx={{ fontSize: TEXT.md, fontWeight: 800, color: zero ? "text.secondary" : BRAND.dark, minWidth: 0 }}
          noWrap
          title={row.hint || row.label}
        >
          {row.label}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 900, color: zero ? "text.secondary" : BRAND.dark }}>
            {row.count}
          </Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", minWidth: 30, textAlign: "right" }}>
            {Math.round(row.percent)}%
          </Typography>
          {clickable ? <ChevronRightRoundedIcon sx={{ fontSize: ICON.sm, color: "text.secondary" }} /> : null}
        </Stack>
      </Stack>
      <Box sx={{ mt: 0.5, height: 6, borderRadius: 999, bgcolor: BRAND.darkSoft, overflow: "hidden" }}>
        <Box sx={{ width: `${Math.min(100, row.percent)}%`, height: "100%", bgcolor: fill, borderRadius: 999 }} />
      </Box>
      {row.unknown > 0 ? (
        <Typography sx={{ mt: 0.35, fontSize: TEXT.xs, color: "text.secondary" }}>
          +{row.unknown} {row.unknownLabel}
        </Typography>
      ) : null}
    </Box>
  );

  if (!clickable) return <Box sx={{ py: 0.75 }}>{body}</Box>;
  return (
    <ButtonBase
      onClick={() => onOpen(row.fleetFilter)}
      aria-label={`${row.label}: ${row.count} devices — open in Hardware Inventory`}
      focusRipple
      sx={{
        width: "100%",
        py: 0.75,
        px: 0.75,
        mx: -0.75,
        borderRadius: 1.5,
        display: "block",
        "&:hover": { bgcolor: BRAND.tealSoft },
        "&.Mui-focusVisible": { boxShadow: FOCUS_RING },
      }}
    >
      {body}
    </ButtonBase>
  );
}

export default function AssetAttentionCard({ attention, loading = false, error = false, onOpenFleetFilter }) {
  const rows = attentionRows(attention);
  const devices = Number(attention?.devices || 0);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 800 }}>
          Needs attention
        </Typography>
        {devices > 0 ? (
          <Chip
            size="small"
            label={`${devices} devices`}
            sx={{ height: 22, fontSize: TEXT.xs, fontWeight: 800, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
          />
        ) : null}
      </Stack>

      {loading && !attention ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading…</Typography>
      ) : error && !attention ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Could not load device health.</Typography>
      ) : (
        <Stack spacing={0.25}>
          {rows.map((r) => (
            <Row key={r.key} row={r} onOpen={onOpenFleetFilter} />
          ))}
        </Stack>
      )}
    </Paper>
  );
}
