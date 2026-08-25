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
//
// The component is deliberately dumb — it owns no state, doesn't know
// about refresh cadence or URL params. Pages compose their own
// IconButtons/Selects/Tooltips into the `actions` slot.

import * as React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { BRAND, LAYOUT, TEXT, TEXT_MUTED } from "../../theme/brand";

export default function PageHeader({
  title,
  subtitle,
  icon = null,
  chips = null,
  actions = null,
  sx = null,
  // Compact variant: title on the same baseline as its subtitle, at h6 size.
  // OPT-IN — the 22 other pages that use this header are untouched.
  //
  // For a page whose subject is a table, the page's own NAME is the largest
  // thing on screen at h4/800 and pushes the data down. Compact hands that
  // room back and lets the subtitle carry a live number instead of a sentence
  // the operator has already read.
  dense = false,
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
                "& svg": { fontSize: dense ? TEXT.xl : TEXT["3xl"], display: "block" },
              }}
            >
              {icon}
            </Box>
          ) : null}
          <Typography
            variant={dense ? "h6" : LAYOUT.header.variant}
            component={LAYOUT.header.component}
            sx={dense ? LAYOUT.headerDense.sx : LAYOUT.header.sx}
          >
            {title}
          </Typography>
          {/* Compact puts the subtitle on the title's baseline, so a live
              count reads as part of the heading instead of a second line. */}
          {dense && subtitle ? (
            <Typography sx={{ fontSize: TEXT.md, color: TEXT_MUTED, whiteSpace: "nowrap" }}>
              {subtitle}
            </Typography>
          ) : null}
        </Stack>
        {!dense && subtitle ? (
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
