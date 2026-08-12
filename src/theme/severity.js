// src/theme/severity.js
//
// THE canonical severity → presentation map for the whole UI.
//
// Before this, ~12 files each defined their own severity color map and they
// DISAGREED: "High" rendered red on Alerts/Overview, amber on Security
// Compliance, and orange in the CVE catalog; "Medium" was teal (the brand
// "OK" color — actively misleading) in a couple of views and amber elsewhere.
// A given severity must look the same everywhere it appears.
//
// The scale runs red → orange → amber → teal → gray so rank reads at a glance:
//   critical (red) > high (orange) > medium (amber) > low (teal) > info/none (gray)
//
// Each entry carries { label, fg, bg } backed by BRAND tokens (no hex here).
// Consumers: chips use fg+bg; single-accent uses fg.

import { BRAND } from "./brand";

export const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0, none: 0 };
export const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

export const SEVERITY_META = {
  critical: { label: "Critical", fg: BRAND.alert.error, bg: BRAND.alert.errorSoft },
  high: { label: "High", fg: BRAND.alert.high, bg: BRAND.alert.highSoft },
  medium: { label: "Medium", fg: BRAND.alert.warningText, bg: BRAND.alert.warningSoft },
  low: { label: "Low", fg: BRAND.tealText, bg: BRAND.tealSoft },
  info: { label: "Info", fg: BRAND.gray, bg: BRAND.darkSoft },
  none: { label: "None", fg: BRAND.gray, bg: BRAND.darkSoft },
};

// Common aliases mapped to canonical keys.
const SEVERITY_ALIASES = {
  crit: "critical",
  warning: "medium",
  warn: "medium",
  moderate: "medium",
  informational: "info",
  unknown: "none",
  "": "none",
};

/** Resolve any severity string to its canonical presentation. */
export function severityMeta(sev) {
  const key = String(sev ?? "").trim().toLowerCase();
  return SEVERITY_META[key] || SEVERITY_META[SEVERITY_ALIASES[key]] || SEVERITY_META.none;
}

/** Numeric rank for sorting (higher = more severe). */
export function severityRank(sev) {
  const key = String(sev ?? "").trim().toLowerCase();
  return SEVERITY_RANK[key] ?? SEVERITY_RANK[SEVERITY_ALIASES[key]] ?? 0;
}
