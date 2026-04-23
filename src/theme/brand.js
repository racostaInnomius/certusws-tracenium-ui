// src/theme/brand.js
//
// Centralized brand tokens. Until now the palette was duplicated inline
// inside every page (Sidebar, Audit, PatchManagement, SecurityCompliance,
// Topbar…) — 5 copies of the same hex values with the same "BRAND"
// object name. Adding a new page meant grep + copy-paste.
//
// This file is the new single source of truth. New work (Overview, and
// whatever comes next) imports from here; existing pages can migrate
// piecemeal without a big-bang refactor.
//
// Palette rules of thumb:
//   - `dark`  → text primario, headers, icons cuando queremos contraste
//     full sobre fondo blanco.
//   - `teal`  → accent primario (SummaryCard icon boxes, primary chips,
//     hover states). Combina con `tealSoft` / `tealText`.
//   - `cyan`  → accent secundario; úsalo para highlights puntuales, no
//     como fondo de páginas (satura la vista).
//   - `gray`  → borders, secondary text, dividers. Casi siempre con
//     alpha vía `border` o `surfaceMuted`.
//
// Severity scale para alerts/banners es ortogonal al brand — no
// sustituyas rojo/ámbar por teal/cyan en mensajes de error, la
// asociación de color con severity existe por razones de usabilidad que
// el branding no debe romper.

export const BRAND = {
  // Primary palette
  dark: "#3B404D",
  teal: "#5A9F9F",
  cyan: "#8FFDFF",
  gray: "#BEBEBE",

  // Derivatives (precomputed to avoid rgba() typos scattered across code)
  tealText: "#3E7878",
  tealSoft: "rgba(90,159,159,0.12)",
  tealSoftStrong: "rgba(90,159,159,0.22)",
  cyanSoft: "rgba(143,253,255,0.22)",
  cyanSoftStrong: "rgba(143,253,255,0.40)",
  darkSoft: "rgba(59,64,77,0.08)",
  border: "rgba(190,190,190,0.30)",
  borderStrong: "rgba(190,190,190,0.50)",
  surface: "#FFFFFF",
  surfaceMuted: "rgba(190,190,190,0.08)",

  // Semantic severity (not brand — universal usability)
  alert: {
    error: "#C62828",
    errorSoft: "rgba(198,40,40,0.08)",
    warning: "#ED6C02",
    warningSoft: "rgba(237,108,2,0.10)",
    success: "#2E7D32",
    successSoft: "rgba(46,125,50,0.10)",
    info: "#5A9F9F",
    infoSoft: "rgba(90,159,159,0.12)"
  }
};

// Named roles — lets pages express intent rather than pick colors.
// `BRAND.role.positive` reads better than `BRAND.alert.success` in a
// Hero KPI, even though they resolve to the same green.
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
  accentSoft: BRAND.cyanSoft
};
