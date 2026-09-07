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

/**
 * What an override PATCH changes with respect to the tenant document: one
 * entry per leaf of the patch, with the tenant's value as `before`. Paths
 * the tenant does not carry come out as `added`. This is the drawer of
 * the Overrides view; the patch is the unit of reading.
 */
export function overrideDiff(tenantJson, overrideJson) {
  const tenant = flattenPolicy(tenantJson ?? {});
  const patch = flattenPolicy(overrideJson ?? {});
  const entries = [];
  for (const [path, after] of [...patch.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (path === "plugins.enabled" || path.startsWith("modules.")) continue;
    const hasBefore = tenant.has(path);
    const before = tenant.get(path);
    if (!hasBefore) entries.push({ path, before: undefined, after, kind: "added" });
    else if (!same(before, after)) entries.push({ path, before, after, kind: "changed" });
    else entries.push({ path, before, after, kind: "same" });
  }
  return entries;
}
