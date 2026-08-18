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

/**
 * Bucket a set of (agent_version, count) rows against the max latest
 * version we know about. Exported because the AttentionPanel uses the
 * same classification for its "agents behind latest" alert — keeping
 * the logic in one place means the two views can't disagree.
 */
export function classifyAgentVersions(byVersion, latestMap) {
  const latestValues = Object.values(latestMap || {}).filter(Boolean);
  // Pick the highest latest across all platforms we got metadata for.
  // In practice this is the same string across platforms once a release
  // ships to all of them, but we don't assume.
  let canonicalLatest = null;
  for (const v of latestValues) {
    if (!canonicalLatest || compareVersions(v, canonicalLatest) > 0) {
      canonicalLatest = v;
    }
  }

  const buckets = { current: 0, oneBehind: 0, older: 0, unknown: 0 };

  if (!Array.isArray(byVersion)) return { buckets, canonicalLatest };

  for (const row of byVersion) {
    const version = row?.version;
    const count = Number(row?.count ?? 0);
    if (!count) continue;

    if (!version || version === "unknown" || !canonicalLatest) {
      buckets.unknown += count;
      continue;
    }

    const cmp = compareVersions(version, canonicalLatest);
    if (cmp >= 0) buckets.current += count;
    else if (oneBehind(version, canonicalLatest)) buckets.oneBehind += count;
    else buckets.older += count;
  }

  return { buckets, canonicalLatest };
}
