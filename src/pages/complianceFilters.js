// src/pages/complianceFilters.js
//
// Pure filter helpers for the Security Compliance device table. Extracted from
// SecurityCompliance.jsx so the URL-parsing + client-side filtering logic is
// unit-testable without rendering the (very large) page.

// Acceptable enum values for the deep-link / on-page filter params. Anything
// else on the URL is ignored — we don't trust the query string to set page
// state beyond what we explicitly support.
export const ALLOWED_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);
export const ALLOWED_STATUSES = new Set(["fail", "pass"]);
export const ALLOWED_PLATFORMS = new Set(["windows", "macos", "linux"]);
export const ALLOWED_VERSION_BUCKETS = new Set(["current", "one_behind", "older", "unknown"]);
// Overview's HealthDistributionCard deep-links with ?score-band= — its
// buckets, not severities. "unscored" = null score (insufficient data).
export const ALLOWED_SCORE_BANDS = new Set(["good", "warning", "critical", "unscored"]);

// Semver-ish comparison. Returns > 0 if b > a, matching the shape JS sort
// expects for descending order (a.sort(cmp) → highest first). Non-numeric
// segments become 0 so it never throws on weird version strings.
export function compareVersionsReverse(a, b) {
  const parse = (v) =>
    String(v || "")
      .split(".")
      .map((x) => Number(x) || 0);
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < Math.max(av.length, bv.length); i += 1) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai !== bi) return bi - ai;
  }
  return 0;
}

// Map a device's agentVersion to one of the buckets the Overview donut uses.
//   cmp <= 0 → device >= canonical → "current"
//   same major.minor, patch within 2 → "one_behind"
//   otherwise → "older"; no version/canonical → "unknown".
export function bucketOfVersion(version, canonicalLatest) {
  if (!version || !canonicalLatest) return "unknown";
  const cmp = compareVersionsReverse(version, canonicalLatest);
  if (cmp <= 0) return "current";
  const v = String(version).split(".").map((x) => Number(x) || 0);
  const l = String(canonicalLatest).split(".").map((x) => Number(x) || 0);
  if (v[0] === l[0] && v[1] === l[1] && Math.abs((l[2] || 0) - (v[2] || 0)) <= 2) {
    return "one_behind";
  }
  return "older";
}

// Parse a URL search string ("?status=fail&platform=linux") into validated
// filter state. Takes the search string (not window) so it's testable. The
// legacy `severity` param was a fail-proxy, so any recognized severity maps to
// the honest status="fail".
export function parseUrlFilters(search) {
  const params = new URLSearchParams(search || "");
  const status = (params.get("status") || "").toLowerCase();
  const legacySeverity = (params.get("severity") || "").toLowerCase();
  const platform = (params.get("platform") || "").toLowerCase();
  const versionBucket = (params.get("versionBucket") || "").toLowerCase();
  // Sprint 2 item 8 — ?score-band= from the Overview health card. The
  // card's header comment promised the SCP page accepted this param
  // since the day it shipped; this is the first time it's been true.
  const scoreBand = (params.get("score-band") || "").toLowerCase();
  return {
    status: ALLOWED_STATUSES.has(status)
      ? status
      : ALLOWED_SEVERITIES.has(legacySeverity)
      ? "fail"
      : "",
    platform: ALLOWED_PLATFORMS.has(platform) ? platform : "",
    versionBucket: ALLOWED_VERSION_BUCKETS.has(versionBucket) ? versionBucket : "",
    scoreBand: ALLOWED_SCORE_BANDS.has(scoreBand) ? scoreBand : "",
  };
}

// True when a device matches the status filter. "fail" ⇒ overallStatus is
// fail/non_compliant; "pass" ⇒ pass/compliant; "" ⇒ no status filter.
export function deviceMatchesStatus(device, statusFilter) {
  if (!statusFilter) return true;
  const s = String(device?.overallStatus || "").toLowerCase();
  if (statusFilter === "fail") return s === "fail" || s === "non_compliant";
  if (statusFilter === "pass") return s === "pass" || s === "compliant";
  return true;
}

// Apply the active filters to the device list. Version bucketing needs the
// fleet's "canonical latest" (highest reported agentVersion), computed once here
// — matching the previous in-page memo behavior.
// Band membership for the score-band filter. `bands` are the tenant's
// configured thresholds (theme/scoreBands DEFAULT_BANDS when absent) —
// the SAME scale the Health Distribution card bucketed with, so the
// click-through count matches what the card showed.
export function deviceMatchesScoreBand(device, bandFilter, bands) {
  if (!bandFilter) return true;
  const score = device?.overallScore;
  const goodMin = bands?.goodMin ?? 85;
  const warningMin = bands?.warningMin ?? 60;
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return bandFilter === "unscored";
  }
  const s = Number(score);
  // A scored device can never match "unscored" — without this early
  // return it fell through to the permissive default and the filter
  // matched everything.
  if (bandFilter === "unscored") return false;
  if (bandFilter === "good") return s >= goodMin;
  if (bandFilter === "warning") return s >= warningMin && s < goodMin;
  if (bandFilter === "critical") return s < warningMin;
  return true;
}

export function filterDevices(devices, filters = {}, bands = null) {
  if (!Array.isArray(devices)) return [];
  const { status = "", platform = "", versionBucket = "", scoreBand = "" } = filters;

  let canonicalLatest = null;
  if (versionBucket) {
    const versions = devices.map((d) => d.agentVersion).filter(Boolean);
    canonicalLatest = versions.slice().sort(compareVersionsReverse)[0];
  }

  return devices.filter((d) => {
    if (platform && String(d.platform || "").toLowerCase() !== platform) return false;
    if (status && !deviceMatchesStatus(d, status)) return false;
    if (versionBucket && bucketOfVersion(d.agentVersion, canonicalLatest) !== versionBucket) {
      return false;
    }
    if (scoreBand && !deviceMatchesScoreBand(d, scoreBand, bands)) return false;
    return true;
  });
}
