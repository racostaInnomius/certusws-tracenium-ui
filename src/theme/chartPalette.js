// src/theme/chartPalette.js
//
// Curated chart palettes. These are the series colors shared by more than one
// chart — the per-chart maps that encode domain meaning (e.g. the printer
// vendor map in PrintersByVendorPie) deliberately stay local to their chart.
//
// Why this module exists: the categorical ramps below started as `const
// BAR_COLORS = [...]` copy-pasted into each chart, and their first entries were
// re-typed brand hexes ("#5A9F9F" instead of BRAND.teal). That meant a brand
// palette change would silently skip the charts. Everything that IS a brand
// color now references BRAND so drift is impossible; the extra steps are
// chart-only tones that extend the ramp past what BRAND defines.

import { BRAND } from "./brand";

// Chart-only tones — greens/mints that extend the brand teal into a ramp with
// enough perceptual separation for adjacent categorical slices.
const MINT = "#52B788";
const MINT_SOFT = "#86C6A8";
const MINT_PALE = "#B9E3D0";

// Categorical ramp for "top N" bar charts (OS versions, manufacturers).
// Ordered most- to least-prominent: the first bar is the biggest, so it gets
// the strongest brand color.
export const CHART_SERIES = [BRAND.teal, BRAND.tealText, MINT, MINT_PALE];

// Same ramp extended for donuts, which show more slices at once.
export const CHART_SERIES_WIDE = [BRAND.teal, BRAND.tealText, MINT, MINT_SOFT, MINT_PALE];

// Multi-framework trend lines. Needs more perceptual separation than the teal
// ramp gives (7 overlapping lines on one axis), so it deliberately reaches
// outside the brand range — these are line strokes, not fills, and a
// teal-on-teal chart would be unreadable.
export const CHART_CATEGORICAL = [
  BRAND.teal,
  "#6B7FD7",
  "#D78B3E",
  BRAND.dark,
  MINT,
  "#C05E9E",
  "#8FBF3F",
];

// Neutral grays for catch-all buckets ("Other" / "Unknown"). Kept deliberately
// low-contrast so real categories win the operator's attention.
export const CHART_NEUTRAL = {
  other: "#A8B0B5", // neutral mid-gray, slightly cool
  unknown: "#D0D5D8", // lighter — even less attention-grabbing
};
