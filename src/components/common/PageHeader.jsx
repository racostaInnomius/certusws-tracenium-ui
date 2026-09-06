// src/components/common/PageHeader.jsx
//
// The single canonical page-header component. Every page under
// src/pages should use this instead of hand-rolling a <Box><Typography>
// pair — otherwise we drift back into the h4/700 vs h5/800 vs custom
// accent-color mess the Fase 1 audit uncovered.
//
// Layout contract:
//   - Icon:  optional, rendered to the LEFT of the title inside a
//            teal-tinted rounded square (mirrors the Sidebar icon for
//            the current page so the two surfaces read as one).
//   - Title: h4 · fontWeight 800 · letterSpacing -0.5 · BRAND.dark
//   - Subtitle: body2 · text.secondary · mt 0.25 (optional, renders
//     only when `subtitle` is truthy)
//   - Actions: right-aligned cluster (refresh, export, auto-refresh,
//     filter toggle…). Renders in a flex-wrap row so narrow widths
//     stack without overflowing.
//   - Chips: a separate row under the title used for lightweight meta
//     (e.g. Overview's Freshness chip + error). Optional.
//   - Back:  optional breadcrumb-ish control rendered ABOVE the title,
//     top-left. Va aquí y no en `actions` a propósito: `actions` es la
//     esquina de "qué puedo hacer en esta página" (refrescar, exportar,
//     crear), y un "volver" metido ahí compite con la acción primaria y
//     cambia de sitio según cuántos botones tenga cada página. Arriba a
//     la izquierda está siempre en el mismo píxel, que es lo que hace
//     que se encuentre sin buscarlo.
//
// The component is deliberately dumb — it owns no state, doesn't know
// about refresh cadence or URL params. Pages compose their own
// IconButtons/Selects/Tooltips into the `actions` slot.

import * as React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { BRAND, LAYOUT, TEXT } from "../../theme/brand";

export default function PageHeader({
  title,
  subtitle,
  icon = null,
  chips = null,
  actions = null,
  back = null,
  sx = null,
}) {
  return (
    <Stack
      direction="row"
      alignItems={{ xs: "stretch", sm: "flex-start" }}
      justifyContent="space-between"
      flexWrap="wrap"
      gap={2}
      sx={{ mb: 2, ...(sx || {}) }}
    >
      <Box sx={{ minWidth: 0 }}>
        {back ? <Box sx={{ mb: 0.5, ml: -1 }}>{back}</Box> : null}
        {/* Icon sits in the same row as the title only — not the whole
            title+subtitle block. center alignment puts the icon
            vertically in the middle of the title's line height so it
            reads as part of the same visual line, not anchored above
            or below the text. */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{ minWidth: 0 }}
        >
          {icon ? (
            <Box
              sx={{
                color: BRAND.teal,
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                "& svg": { fontSize: TEXT["3xl"], display: "block" },
              }}
            >
              {icon}
            </Box>
          ) : null}
          <Typography
            variant={LAYOUT.header.variant}
            component={LAYOUT.header.component}
            sx={LAYOUT.header.sx}
          >
            {title}
          </Typography>
        </Stack>
        {subtitle ? (
          <Typography variant={LAYOUT.subtitle.variant} sx={LAYOUT.subtitle.sx}>
            {subtitle}
          </Typography>
        ) : null}
        {chips ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
            {chips}
          </Stack>
        ) : null}
      </Box>
      {actions ? (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          {actions}
        </Stack>
      ) : null}
    </Stack>
  );
}
