// src/components/common/SummaryCard.jsx
//
// Shared KPI card. Before Fase 1 every page (Overview/Jobs/PKI/Audit/
// Tokens/Tenants/Assets) had its own inline `function SummaryCard(...)`
// — 7 copies with subtle differences (some had tooltips, some had a
// `stretch` prop, some had a different accent background). This
// component folds all the useful features of those copies into one:
//
//   - `title`, `value`, `icon`: the core data.
//   - `accent`, `tint`: override the icon-box color/background. Defaults
//     match the brand teal.
//   - `titleHint`: shows a tooltip-anchored "ⓘ" next to the title.
//     Audit uses this for metrics that need explanation ("Devices seen
//     ≠ active fleet because rejected enrollments count too").
//   - `stretch`: sets height:100% so the card fills its Grid cell —
//     use when sibling cards vary in height and you want bottom-edge
//     alignment (Audit's 3×2 grid next to a chart).
//   - `onClick`: turns the card into a button-like surface with the
//     brand hover (border teal + soft shadow). Used by Overview's Hero
//     KPIs for drilldown navigation.
//   - `selected`: ONLY pass it when the card is a toggle (e.g. Patch
//     Management's cards filtering the Devices table). Then the card gets
//     `role="button"` + `aria-pressed`, keyboard activation, and a teal
//     border while on. Left undefined, nothing changes for existing callers.
//
// Visual contract matches LAYOUT.card: borderRadius 2, BRAND.border,
// no shadow in resting state.

import * as React from "react";
import { Box, Paper, Tooltip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";

export default function SummaryCard({
  title,
  value,
  icon = null,
  accent = BRAND.teal,
  tint = BRAND.tealSoft,
  titleHint = null,
  stretch = false,
  onClick = null,
  selected = undefined,
  sx = null,
}) {
  const clickable = typeof onClick === "function";
  // Toggle semantics only when the caller opted in by passing `selected`.
  const isToggle = clickable && typeof selected === "boolean";

  const titleNode = titleHint ? (
    <Tooltip title={titleHint} arrow placement="top">
      <Box
        component="span"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, cursor: "help" }}
      >
        <span>{title}</span>
        <InfoOutlinedIcon sx={{ fontSize: ICON.xs, color: "text.secondary" }} />
      </Box>
    </Tooltip>
  ) : (
    title
  );

  return (
    <Paper
      elevation={0}
      onClick={clickable ? onClick : undefined}
      {...(isToggle
        ? {
            role: "button",
            tabIndex: 0,
            "aria-pressed": selected,
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e);
              }
            },
          }
        : {})}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${isToggle && selected ? BRAND.teal : BRAND.border}`,
        // A second, inset ring so "on" reads as a state, not just a hover.
        boxShadow: isToggle && selected ? `inset 0 0 0 1px ${BRAND.teal}` : undefined,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        width: "100%",
        height: stretch ? "100%" : undefined,
        minWidth: 0,
        cursor: clickable ? "pointer" : "default",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        "&:hover": clickable
          ? { borderColor: BRAND.teal, boxShadow: "0 4px 12px rgba(59,64,77,0.08)" }
          : undefined,
        ...(sx || {}),
      }}
    >
      {icon ? (
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            bgcolor: tint,
            color: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      ) : null}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {/* noWrap so an optional titleHint icon never pushes the title
            onto a second line — that was making sibling cards in the
            same row report different natural heights before `stretch`
            evened them back out, which looked inconsistent across rows. */}
        <Typography
          noWrap
          sx={{
            fontSize: TEXT.sm,
            color: "text.secondary",
            fontWeight: 600,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            lineHeight: 1.2,
          }}
        >
          {titleNode}
        </Typography>
        <Typography noWrap sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: BRAND.dark, lineHeight: 1.1, mt: 0.25 }}>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}
