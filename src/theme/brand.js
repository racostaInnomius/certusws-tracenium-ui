// src/theme/brand.js
// =============================================================================
// TRACENIUM DESIGN SYSTEM — single source of truth
// =============================================================================
//
// This module exports every token the UI is allowed to reference for color,
// layout, and DataGrid styling. The `eslint.config.js` guardrails enforce
// that no other file declares its own `BRAND` or uses raw hex literals (in
// the pages/layout/common-components scope) — if you're looking at this file
// to add a new token, that's the right instinct; if you're looking at this
// file to COPY values into another file, stop and import instead.
//
// -----------------------------------------------------------------------------
// Homologation history (keep this short — just enough to orient a reader)
// -----------------------------------------------------------------------------
//   Fase 1 (tokens + wrappers)
//     - Created this file as the central palette source.
//     - Extracted the <PageHeader>, <SectionPaper>, <SummaryCard> wrappers
//       in src/components/common/ so layout choices live in one place.
//     - Erradicated 7 `const BRAND = {...}` duplicates from pages + layout.
//
//   Fase 2 (Asset Management + Settings)
//     - Migrated Assets/AssetsDashboard/Tokens/Tenants + 5 child pages
//       (SoftwareInventory, HardwareInventory, SoftwareDelivery,
//        Configurations, Welcome) off the old `#1ba6a6 / #16324f / #667085`
//       palette onto BRAND tokens.
//
//   Fase 3 (Clásicas)
//     - Overview/Jobs/PKI/Audit/Policies/PatchManagement/Alerts/
//       SecurityCompliance/RemoteControl all consume <PageHeader>,
//       <SectionPaper>, shared <SummaryCard> (where layout matches),
//       and DATAGRID_SX.
//     - Header canonicalized as h4/800 letterSpacing -0.5 BRAND.dark.
//
//   Fase 4 (guardrails — this file's companion ESLint config)
//     - Fixed the broken eslint.config.js (it imported a package that
//       was never installed, so lint silently never ran).
//     - Added `no-restricted-syntax` rules that FAIL the build on:
//         • hex color literals in pages/layout/auth/non-chart components
//         • `const BRAND = ...` declarations outside this file
//     - Chart files are exempt from the hex rule: multi-series
//       categorical palettes are a legitimate per-chart design concern
//       and live as local `const PALETTE = [...]` arrays.
//
// -----------------------------------------------------------------------------
// How to use
// -----------------------------------------------------------------------------
//
//   import { BRAND, ROLE, LAYOUT, DATAGRID_SX } from "../theme/brand";
//
// Palette intent:
//   - BRAND.dark  → primary text, headers, icons — max contrast on white.
//   - BRAND.teal  → primary accent (CTAs, KPI icon boxes, active states);
//                   pair with tealSoft/tealText for hover + text variants.
//   - BRAND.cyan  → secondary accent; punctual highlights only — not page
//                   backgrounds (it saturates).
//   - BRAND.gray  → borders, secondary text, dividers. Usually indirectly
//                   via `border` / `borderStrong` / `surfaceMuted`.
//
// Severity (ROLE.*, BRAND.alert.*) is ORTHOGONAL to the brand. Red/amber
// in error/warning contexts is a usability signal, not a design choice —
// never substitute teal/cyan for it.
//
// -----------------------------------------------------------------------------
// Layout contract (see also src/components/common/)
// -----------------------------------------------------------------------------
//
//   Header:  <PageHeader title subtitle chips actions />
//            → h4 · fontWeight 800 · letterSpacing -0.5 · BRAND.dark
//
//   Card:    <SectionPaper variant="card">                  …or LAYOUT.card
//            → elevation 0 · borderRadius 2 · BRAND.border · no shadow
//            KPI strips, donuts, compact charts.
//
//   Panel:   <SectionPaper variant="panel">                 …or LAYOUT.panel
//            → elevation 0 · borderRadius 3 · BRAND.border · BRAND.shadow
//            DataGrids, Create-Job forms, detail drawers.
//
//   DataGrid sx: `sx={{ ...DATAGRID_SX, <page overrides> }}`
//
// If you find yourself writing a big inline `sx` that duplicates one of
// the above, the answer is either "use the wrapper" or "extend the token" —
// never "add another local shape".
// =============================================================================

export const BRAND = {
  // Primary palette
  dark: "#3B404D",
  teal: "#5A9F9F",
  cyan: "#8FFDFF",
  gray: "#BEBEBE",

  // Derivatives (precomputed to avoid rgba() typos scattered across code)
  tealText: "#3E7878",
  tealHover: "#4E8C8C",
  tealSoft: "rgba(90,159,159,0.12)",
  tealSoftStrong: "rgba(90,159,159,0.22)",
  cyanSoft: "rgba(143,253,255,0.22)",
  cyanSoftStrong: "rgba(143,253,255,0.40)",
  darkSoft: "rgba(59,64,77,0.08)",
  border: "rgba(190,190,190,0.30)",
  borderStrong: "rgba(190,190,190,0.50)",
  surface: "#FFFFFF",
  surfaceMuted: "rgba(190,190,190,0.08)",
  // Promoted from the local `const BRAND` blocks that used to live
  // in Jobs/PKI/Audit/Policies/PatchManagement. Same values as the
  // former duplicates so the migration is pixel-equivalent.
  rowHover: "rgba(143,253,255,0.10)",
  shadow: "0 8px 20px rgba(59,64,77,0.10)",

  // Semantic severity — the "semáforo" trio used across charts, chips,
  // KPI accents, alert banners. These are part of the Tracenium brand
  // identity, not a stock Material palette.
  //
  //   success → RGB(82, 183, 136)  · #52B788   (positive / OK)
  //   warning → RGB(244, 211, 125) · #F4D37D   (caution / pending)
  //   error   → RGB(227, 125, 120) · #E37D78   (critical / failed)
  //
  // Color theory rationale: the brand axis is teal (hue 180°). Putting
  // success at hue 146° keeps it identifiably "green positive" while
  // staying inside the same cromatic semicircle as teal — no jarring
  // jump across the wheel. Coral (3°) and butter (43°) sit on the warm
  // side, which is the natural habitat for "stop / caution" semantics.
  //
  // Why luminance 52% (over the candidate 59%): in our preprod side-
  // by-side, the lighter green (#6FBF98) felt washed-out next to the
  // warm coral/butter — the trio lost visual anchor. The slightly
  // darker `#52B788` reads as "present, confident" against fleet-table
  // chips and AuditTimeseriesChart bars without crossing into the
  // heavy MUI-green territory of the original `#2E7D32` (luminance 33%).
  //
  // Why the success *Soft alpha is lower (0.16) than coral/butter:
  // `#52B788` has higher saturation (38%) than the pastel coral/butter
  // (which sit around 65–84% saturation but at much higher luminance),
  // so a 16% tint already reads visibly on white. Bumping to 28% would
  // make it muddy. The other two stay at 0.22/0.30 because their high
  // luminance (68%/72%) needs more alpha to show up.
  //
  // Contrast caveat: text in the matching `*` color over `*Soft` bg is
  // pleasantly soft but does NOT meet WCAG AA for body text. For chip
  // labels we accept the brand intent ("filled tint stands out, not
  // an outline"). For longer text use BRAND.dark over the *Soft bg
  // instead of the alert hue.
  alert: {
    error: "#E37D78",
    errorSoft: "rgba(227,125,120,0.22)",
    warning: "#F4D37D",
    warningSoft: "rgba(244,211,125,0.30)",
    success: "#52B788",
    successSoft: "rgba(82,183,136,0.16)",
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

// ---------------------------------------------------------------------------
// LAYOUT — the shared "shape" of pages, independent of color tokens above.
//
// Every page in src/pages has, historically, hand-rolled its own header
// typography (sometimes h4/800, sometimes h5/700), its own Paper sx
// (borderRadius 2 vs 3, shadow yes/no), its own responsive padding, etc.
// That made "add a new page" an exercise in picking a random page to
// copy-paste from, which is how we ended up with 3 conflicting layouts.
//
// These tokens codify the single official layout (decided in the
// homologation Fase 1):
//   - Header: h4 · fontWeight 800 · letterSpacing -0.5 · BRAND.dark
//   - Card (KPI/donut/chart):  elevation 0 · borderRadius 2 · no shadow
//   - Panel (DataGrid/form):   elevation 0 · borderRadius 3 · BRAND.shadow
//
// Consume via the <PageHeader>, <SummaryCard>, <SectionPaper> wrappers
// in src/components/common so page code stays declarative.
// ---------------------------------------------------------------------------

export const LAYOUT = {
  page: {
    // Bottom padding so the last row doesn't kiss the scroll edge —
    // matches what Overview/Jobs/PKI already use.
    pb: 4,
  },
  header: {
    // Applied on <Typography>. Merging this object into `sx` yields
    // the canonical page-title look.
    variant: "h4",
    sx: { color: BRAND.dark, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2 },
  },
  subtitle: {
    // The one-line description under the page title.
    variant: "body2",
    sx: { color: "text.secondary", mt: 0.25 },
  },
  card: {
    // "Light" container — KPI strips, donuts, small charts. Deliberately
    // shadowless: the border already separates it from the page background
    // and piling shadows on low-density cards reads as noise.
    elevation: 0,
    sx: {
      p: 2,
      borderRadius: 2,
      border: `1px solid ${BRAND.border}`,
      height: "100%",
    },
  },
  panel: {
    // "Heavy" container — DataGrid wrappers, Create-Job forms, detail
    // drawers. The shadow adds the bit of depth dense content benefits
    // from, matches the historical Jobs/PKI/Audit pattern.
    elevation: 0,
    sx: {
      p: { xs: 1.5, sm: 2 },
      borderRadius: 3,
      border: `1px solid ${BRAND.border}`,
      boxShadow: BRAND.shadow,
    },
  },
  grid: {
    // Default row settings for a <Grid container>. `alignItems: stretch`
    // is key to avoiding the "one column taller than the other" visual
    // glitch that plagued early Overview revisions.
    container: true,
    spacing: 2,
    alignItems: "stretch",
  },
};

// ---------------------------------------------------------------------------
// DATAGRID_SX — single `sx` blob for every MUI X DataGrid in the app.
//
// Previously duplicated in Jobs.jsx, PKI.jsx (as `dataGridSx`), Audit.jsx,
// and a handful of others — with tiny typo-driven differences (rowHover
// missing here, footer border missing there). Exporting one object
// guarantees the grids stay visually identical as we add more pages.
// ---------------------------------------------------------------------------

export const DATAGRID_SX = {
  border: "none",
  "& .MuiDataGrid-columnHeaders": {
    backgroundColor: BRAND.darkSoft,
    color: BRAND.dark,
    fontWeight: 700,
    borderBottom: `1px solid ${BRAND.border}`,
  },
  "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 700 },
  "& .MuiDataGrid-row": {
    cursor: "pointer",
    transition: "background-color 0.12s ease",
  },
  "& .MuiDataGrid-row:hover": { backgroundColor: BRAND.rowHover },
  "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": {
    backgroundColor: BRAND.cyanSoft,
  },
  "& .MuiDataGrid-cell": { borderBottom: `1px solid ${BRAND.border}` },
  "& .MuiDataGrid-footerContainer": { borderTop: `1px solid ${BRAND.border}` },
};
