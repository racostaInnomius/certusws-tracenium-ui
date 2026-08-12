// src/msp/HierarchyBreadcrumb.jsx
//
// The context indicator shown while inside a client shell (F1):
//   Portfolio  ›  <Client name>
// The "Portfolio" segment is clickable — it exits the active client and
// returns to the portfolio grid.

import * as React from "react";
import { Box, Breadcrumbs, Link, Typography } from "@mui/material";
import NavigateNextOutlinedIcon from "@mui/icons-material/NavigateNextOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import { BRAND } from "../theme/brand";
import { useMsp } from "./MspContext";

export default function HierarchyBreadcrumb() {
  const { activeTenant, exitTenant } = useMsp();
  if (!activeTenant) return null;

  return (
    <Breadcrumbs
      separator={<NavigateNextOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />}
      sx={{ "& .MuiBreadcrumbs-ol": { flexWrap: "nowrap" } }}
    >
      <Link
        component="button"
        underline="hover"
        onClick={exitTenant}
        sx={{
          display: "inline-flex", alignItems: "center", gap: 0.5,
          color: BRAND.gray, fontWeight: 600, fontSize: 13,
        }}
      >
        <GridViewOutlinedIcon sx={{ fontSize: 15 }} />
        Portfolio
      </Link>
      <Box sx={{ display: "inline-flex", alignItems: "center" }}>
        <Typography sx={{ color: BRAND.dark, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}>
          {activeTenant.name || `Tenant ${activeTenant.id}`}
        </Typography>
      </Box>
    </Breadcrumbs>
  );
}
