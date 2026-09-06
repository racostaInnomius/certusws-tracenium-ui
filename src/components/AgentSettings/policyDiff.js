// src/components/AgentSettings/policyDiff.js
//
// Flat diff between two policy documents, for the "review before saving"
// step and the unsaved-changes indicator. Deliberately shallow in what it
// understands: objects recurse, arrays and primitives are compared as
// JSON. That is enough for a policy (a small document of scalars and
// short lists) and keeps the output readable — one line per leaf.

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** dotted path → leaf value, sorted by path. Arrays are leaves. */
export function flattenPolicy(value, prefix = "", out = new Map()) {
  if (!isPlainObject(value)) {
    if (prefix) out.set(prefix, value);
    return out;
  }
  const keys = Object.keys(value).sort();
  if (keys.length === 0 && prefix) {
    out.set(prefix, {});
    return out;
  }
  for (const k of keys) {
    const path = prefix ? `${prefix}.${k}` : k;
    const v = value[k];
    if (isPlainObject(v)) flattenPolicy(v, path, out);
    else out.set(path, v);
  }
  return out;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Entries: { path, before, after, kind } with kind ∈ added | removed | changed.
 * Sorted by path so the same two documents always produce the same list.
 */
export function diffPolicies(before, after) {
  const a = flattenPolicy(before ?? {});
  const b = flattenPolicy(after ?? {});
  const paths = new Set([...a.keys(), ...b.keys()]);
  const entries = [];
  for (const path of [...paths].sort()) {
    const hasA = a.has(path);
    const hasB = b.has(path);
    if (hasA && !hasB) entries.push({ path, before: a.get(path), after: undefined, kind: "removed" });
    else if (!hasA && hasB) entries.push({ path, before: undefined, after: b.get(path), kind: "added" });
    else if (!same(a.get(path), b.get(path))) entries.push({ path, before: a.get(path), after: b.get(path), kind: "changed" });
  }
  return entries;
}

export function formatDiffValue(value) {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value === "" ? '""' : value;
  return JSON.stringify(value);
}
