// src/components/AssetsDashboard/detailAtoms.jsx
//
// Small presentational atoms for the agent detail workbench, extracted from
// the AssetsDashboard god-component. DetailStatCard is the icon + headline
// stat tile; DetailField is a label/value pair (optionally monospaced) that
// truncates with a title tooltip; FieldGrid is their responsive 1/2/3-column
// container. All pure — value fallbacks render an em-dash.

import * as React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

export function DetailStatCard({ title, value, icon, accent = BRAND.teal, helper }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: "100%",
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(190,190,190,0.07))",
        boxShadow: "0 6px 18px rgba(59,64,77,0.07)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.25 }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            bgcolor: `${accent}22`,
            color: accent,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.4 }}>
          {title}
        </Typography>
      </Stack>
      <Typography sx={{ fontSize: TEXT.xl, fontWeight: 900, color: BRAND.dark, lineHeight: 1.15 }} noWrap title={String(value || "—")}>
        {value || "—"}
      </Typography>
      {helper ? (
        <Typography sx={{ mt: 0.75, fontSize: TEXT.sm, color: "text.secondary" }} noWrap title={helper}>
          {helper}
        </Typography>
      ) : null}
    </Paper>
  );
}

export function DetailField({ label, value, mono = false, hint = "" }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: TEXT.xs, fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.35,
          fontSize: TEXT.md,
          fontWeight: 700,
          color: BRAND.dark,
          fontFamily: mono ? "monospace" : "inherit",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={String(value || "—")}
      >
        {value || "—"}
      </Typography>
      {/* Optional second line explaining a value that is technically correct
          but not self-explanatory — e.g. a bare CIDR under "Location", which
          is what is left when no site mapping and no GPS fix exist. */}
      {hint ? (
        <Typography sx={{ mt: 0.25, fontSize: TEXT.xs, color: "text.secondary", whiteSpace: "normal" }}>
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

export function FieldGrid({ children }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" },
        gap: 1.5,
      }}
    >
      {children}
    </Box>
  );
}
