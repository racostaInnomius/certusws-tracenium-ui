// src/theme/scoreBands.js
//
// Sprint 2 item 1 — THE score-band authority.
//
// Before this file, score thresholds were hardcoded in five places with
// two different scales (85/60 in the SCP hero, ScoreBar, Sparkline and
// HealthDistributionCard; 90/70 in CategoryBreakdown's rateColor and
// the MSP grid), and the tenant-configurable
// complianceBandGoodMin/WarningMin settings were WRITE-ONLY: the panel
// saved them, its help text promised they drove the Health Distribution
// card, and nothing anywhere read them back.
//
// Now: every consumer calls scoreBandRole()/scoreBandKey() with the
// bands from useComplianceBands() (or the defaults, which mirror the
// backend's SYSTEM_DEFAULTS in tenant-settings-cache.ts — keep in
// sync). The setting finally does what its help text says.

import { ROLE } from "./brand";

// Mirror of backend SYSTEM_DEFAULTS (tenant-settings-cache.ts). Used
// whenever the effective settings haven't loaded (or the viewer can't
// read them) so every surface degrades to the same scale instead of
// five private ones.
export const DEFAULT_BANDS = Object.freeze({
  goodMin: 85,
  warningMin: 60,
});

function normalizeBound(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
}

/** Coerce an effective-settings object (or anything) into safe bands. */
export function normalizeBands(effective) {
  return {
    goodMin: normalizeBound(effective?.complianceBandGoodMin, DEFAULT_BANDS.goodMin),
    warningMin: normalizeBound(effective?.complianceBandWarningMin, DEFAULT_BANDS.warningMin),
  };
}

/**
 * Bucket key for a 0-100 score: "good" | "warning" | "critical",
 * null for a null/absent score (insufficient data — callers render
 * their own neutral state, never a band color).
 */
export function scoreBandKey(score, bands = DEFAULT_BANDS) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s >= bands.goodMin) return "good";
  if (s >= bands.warningMin) return "warning";
  return "critical";
}

/** ROLE color for a score (positive/caution/critical), null when unscored. */
export function scoreBandRole(score, bands = DEFAULT_BANDS) {
  const key = scoreBandKey(score, bands);
  if (key === "good") return ROLE.positive;
  if (key === "warning") return ROLE.caution;
  if (key === "critical") return ROLE.critical;
  return null;
}

/** Soft (background) ROLE color for a score. */
export function scoreBandSoftRole(score, bands = DEFAULT_BANDS) {
  const key = scoreBandKey(score, bands);
  if (key === "good") return ROLE.positiveSoft;
  if (key === "warning") return ROLE.cautionSoft;
  if (key === "critical") return ROLE.criticalSoft;
  return null;
}
