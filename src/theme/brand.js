// src/theme/brand.js
// =============================================================================
// TRACENIUM DESIGN SYSTEM — single source of truth
// =============================================================================
//
// This module exports every token the UI is allowed to reference for color,
// layout, and DataGrid styling.

export const BRAND = {
  // Primary palette
  dark: "#3B404D",
  teal: "#5A9F9F",
  cyan: "#8FFDFF",
  gray: "#BEBEBE",

  // Derivatives
  tealText: "#3E7878",
  tealHover: "#4E8C8C",

  // Bright chrome accent for shell/branding only.
  // Use it for topbar/sidebar separator lines and small brand punctuation marks.
  // Do not use it as the general card/chart/button color.
  accentBright: "#80fff6",
  accentBrightHover: "#18E58F",
  accentBrightSoft: "rgba(24,229,143,0.18)",
  accentBrightLine: "rgba(128,255,246,0.78)",

  tealSoft: "rgba(90,159,159,0.12)",
  tealSoftStrong: "rgba(90,159,159,0.22)",
  cyanSoft: "rgba(143,253,255,0.22)",
  cyanSoftStrong: "rgba(143,253,255,0.40)",
  darkSoft: "rgba(59,64,77,0.08)",
  border: "rgba(190,190,190,0.30)",
  borderStrong: "rgba(190,190,190,0.50)",
  surface: "#FFFFFF",
  surfaceMuted: "rgba(190,190,190,0.08)",
  rowHover: "rgba(143,253,255,0.10)",
  shadow: "0 8px 20px rgba(59,64,77,0.10)",

  alert: {
    error: "#E37D78",
    errorSoft: "rgba(227,125,120,0.22)",
    errorText: "#B23A33",
    warning: "#F4D37D",
    warningSoft: "rgba(244,211,125,0.30)",
    warningText: "#8A6519",
    success: "#52B788",
    successSoft: "rgba(82,183,136,0.16)",
    info: "#5A9F9F",
    infoSoft: "rgba(90,159,159,0.12)",
  },

  // Darker, text-legible counterpart to `cyan` (#8FFDFF is an accent
  // color, far too light for small chip/label text on a light surface).
  cyanText: "#0E7C80",
};

export const ROLE = {
  positive: BRAND.alert.success,
  positiveSoft: BRAND.alert.successSoft,
  caution: BRAND.alert.warning,
  cautionSoft: BRAND.alert.warningSoft,
  critical: BRAND.alert.error,
  criticalSoft: BRAND.alert.errorSoft,
  neutral: BRAND.teal,
  neutralSoft: BRAND.tealSoft,
  accent: BRAND.cyan,
  accentSoft: BRAND.cyanSoft,
};

export const LAYOUT = {
  page: {
    pb: 4,
  },
  header: {
    variant: "h4",
    sx: {
      color: BRAND.dark,
      fontWeight: 800,
      letterSpacing: -0.5,
      lineHeight: 1.2,
    },
  },
  subtitle: {
    variant: "body2",
    sx: {
      color: "text.secondary",
      mt: 0.25,
    },
  },
  card: {
    elevation: 0,
    sx: {
      p: 2,
      borderRadius: 2,
      border: `1px solid ${BRAND.border}`,
      height: "100%",
    },
  },
  panel: {
    elevation: 0,
    sx: {
      p: { xs: 1.5, sm: 2 },
      borderRadius: 3,
      border: `1px solid ${BRAND.border}`,
      boxShadow: BRAND.shadow,
    },
  },
  grid: {
    container: true,
    spacing: 2,
    alignItems: "stretch",
  },
};

export const DATAGRID_SX = {
  border: "none",
  "& .MuiDataGrid-columnHeaders": {
    backgroundColor: BRAND.darkSoft,
    color: BRAND.dark,
    fontWeight: 700,
    borderBottom: `1px solid ${BRAND.border}`,
  },
  "& .MuiDataGrid-columnHeaderTitle": {
    fontWeight: 700,
  },
  "& .MuiDataGrid-row": {
    cursor: "pointer",
    transition: "background-color 0.12s ease",
  },
  "& .MuiDataGrid-row:hover": {
    backgroundColor: BRAND.rowHover,
  },
  "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": {
    backgroundColor: BRAND.cyanSoft,
  },
  "& .MuiDataGrid-cell": {
    borderBottom: `1px solid ${BRAND.border}`,
  },
  "& .MuiDataGrid-footerContainer": {
    borderTop: `1px solid ${BRAND.border}`,
  },
};