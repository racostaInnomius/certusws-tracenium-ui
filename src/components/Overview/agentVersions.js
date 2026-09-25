// src/components/Overview/agentVersions.js
//
// Agent-version classification, pulled out of FleetComposition.jsx.
//
// It lived next to the donut that draws it, which was reasonable until
// AttentionPanel imported `classifyAgentVersions` from there — a pure
// function with no chart in it, but importing the module dragged Recharts
// (~152 KB) along, straight onto the landing page's critical path. Both
// callers read it from here now, so the classification stays in one place
// without that cost.

export function compareVersions(a, b) {
  const parse = (v) =>
    String(v || "")
      .split(".")
      .map((x) => {
        const n = Number(x);
        return Number.isFinite(n) ? n : 0;
      });
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai !== bi) return ai > bi ? 1 : -1;
  }
  return 0;
}

function oneBehind(current, latest) {
  // current is "one behind" if latest > current AND they differ only in
  // the last segment by 1-2 patches OR by a minor that's within 1. This
  // is deliberately forgiving — in a CISO dashboard you want a visual
  // "still safe-ish" bucket separate from "way behind".
  const parse = (v) =>
    String(v || "").split(".").map((x) => Number(x) || 0);
  const c = parse(current);
  const l = parse(latest);
  if (compareVersions(current, latest) >= 0) return false;
  // Same major+minor, patch diff <= 2
  if (c[0] === l[0] && c[1] === l[1] && Math.abs(l[2] - c[2]) <= 2) return true;
  return false;
}

/** Highest "latest published" version across the platforms we have metadata for. */
export function canonicalLatestOf(latestMap) {
  let canonicalLatest = null;
  for (const v of Object.values(latestMap || {}).filter(Boolean)) {
    if (!canonicalLatest || compareVersions(v, canonicalLatest) > 0) canonicalLatest = v;
  }
  return canonicalLatest;
}

/**
 * The bucket ONE version falls in: "current" | "one_behind" | "older" |
 * "unknown". The single definition of the rule — the donut counts with it
 * and the Assets table filters with it, so the two cannot disagree.
 */
export function bucketOfAgentVersion(version, canonicalLatest) {
  if (!version || version === "unknown" || !canonicalLatest) return "unknown";
  if (compareVersions(version, canonicalLatest) >= 0) return "current";
  if (oneBehind(version, canonicalLatest)) return "one_behind";
  return "older";
}

/**
 * Bucket a set of (agent_version, count) rows against the max latest
 * version we know about. Exported because the AttentionPanel uses the
 * same classification for its "agents behind latest" alert — keeping
 * the logic in one place means the two views can't disagree.
 */
export function classifyAgentVersions(byVersion, latestMap) {
  // Pick the highest latest across all platforms we got metadata for.
  // In practice this is the same string across platforms once a release
  // ships to all of them, but we don't assume.
  const canonicalLatest = canonicalLatestOf(latestMap);
  const buckets = { current: 0, oneBehind: 0, older: 0, unknown: 0 };
  const key = { current: "current", one_behind: "oneBehind", older: "older", unknown: "unknown" };

  if (!Array.isArray(byVersion)) return { buckets, canonicalLatest };

  for (const row of byVersion) {
    const count = Number(row?.count ?? 0);
    if (!count) continue;
    buckets[key[bucketOfAgentVersion(row?.version, canonicalLatest)]] += count;
  }

  return { buckets, canonicalLatest };
}

/**
 * Which exact versions make up a bucket, for filtering the device list on the
 * SERVER. Built from the same `/dashboard/agent-versions` rows the donut
 * counts, so filtering "older" returns the devices the donut called older.
 *
 * `versions` may be empty: a bucket with no devices must filter to nothing,
 * not fall back to the whole fleet.
 */
export function versionsInBucket(byVersion, latestMap, bucket) {
  const canonicalLatest = canonicalLatestOf(latestMap);
  const versions = [];
  let includeUnknown = false;
  for (const row of Array.isArray(byVersion) ? byVersion : []) {
    if (bucketOfAgentVersion(row?.version, canonicalLatest) !== bucket) continue;
    if (!row?.version || row.version === "unknown") includeUnknown = true;
    else versions.push(String(row.version));
  }
  return { versions, includeUnknown };
}

// ── Rebanada de la dona ↔ filtro de la tabla ──────────────────────────────
//
// Una sola traducción para las dos superficies que la usan (el enlace del
// Overview y el filtro de la tabla de Assets): si cada una tuviera la suya,
// «One behind» podría llevar a un filtro en una y a otro en la otra.
const SEGMENT_TO_BUCKET = {
  Current: "current",
  "One behind": "one_behind",
  Older: "older",
  Unknown: "unknown",
};

/** "One behind" → "one_behind". Lo que no es un grupo de versión → null. */
export function bucketOfSegmentName(name) {
  return SEGMENT_TO_BUCKET[String(name ?? "")] ?? null;
}

/** "one_behind" → "One behind", para resaltar la rebanada del filtro activo. */
export function segmentNameOfBucket(bucket) {
  return Object.keys(SEGMENT_TO_BUCKET).find((k) => SEGMENT_TO_BUCKET[k] === bucket) ?? null;
}
