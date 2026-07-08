// src/components/patch-management/cveSeverity.js
//
// Shared CVSS severity presentation for the CVE (vulnerable-software) views.
// Colors run red→orange→amber→teal→gray so a glance at the chip conveys rank.

import { BRAND } from "../../theme/brand";

export const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };

export const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

export const SEVERITY_META = {
  critical: { label: "Critical", bg: BRAND.alert?.errorSoft, fg: BRAND.alert?.error },
  high: { label: "High", bg: "rgba(199,121,43,0.16)", fg: "#8b5418" },
  medium: { label: "Medium", bg: BRAND.alert?.warningSoft, fg: "#7a5c00" },
  low: { label: "Low", bg: BRAND.tealSoft, fg: BRAND.tealText },
  none: { label: "None", bg: BRAND.darkSoft, fg: BRAND.gray },
};

export function severityMeta(sev) {
  return SEVERITY_META[sev] || SEVERITY_META.none;
}
