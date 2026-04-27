// src/components/common/SectionPaper.jsx
//
// Canonical Paper wrapper. Two variants codify the one decision pages
// kept re-answering:
//
//   - `variant="card"`  (DEFAULT): light container — KPI rows, donuts,
//     small charts. borderRadius 2, no shadow. Matches Overview's
//     existing look.
//   - `variant="panel"`: heavy container — DataGrid wrappers, forms,
//     detail drawers. borderRadius 3 + BRAND.shadow. Matches the
//     historical Jobs/PKI/Audit pattern the user approved.
//
// Both variants share:
//   - elevation 0 (MUI's default shadow is ugly against our palette).
//   - 1px BRAND.border.
//   - minWidth: 0 (prevents DataGrid overflow inside Grid columns).
//
// Intentionally minimal API — page code should pass `sx` overrides
// sparingly; if you find yourself passing 5 overrides, either add a
// variant here or the page is doing something non-standard.

import * as React from "react";
import { Paper } from "@mui/material";
import { BRAND, LAYOUT } from "../../theme/brand";

export default function SectionPaper({
  variant = "card",
  onClick = null,
  hoverable = false,
  children,
  sx = null,
  ...rest
}) {
  const base = variant === "panel" ? LAYOUT.panel.sx : LAYOUT.card.sx;
  const clickable = typeof onClick === "function";
  const wantsHover = clickable || hoverable;

  return (
    <Paper
      elevation={0}
      onClick={clickable ? onClick : undefined}
      sx={{
        ...base,
        minWidth: 0,
        cursor: clickable ? "pointer" : "default",
        transition: wantsHover ? "border-color 120ms ease, box-shadow 120ms ease" : undefined,
        "&:hover": wantsHover
          ? {
              borderColor: BRAND.teal,
              boxShadow: "0 4px 12px rgba(59,64,77,0.08)",
            }
          : undefined,
        ...(sx || {}),
      }}
      {...rest}
    >
      {children}
    </Paper>
  );
}
