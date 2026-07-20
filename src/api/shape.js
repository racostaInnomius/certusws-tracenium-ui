// src/api/shape.js
//
// Lightweight, dependency-free response-shape guards for the API boundary.
//
// The dashboard is data-heavy and untyped: pages `.map`/destructure API
// responses directly, so a backend contract change (a list endpoint that
// starts returning `{items:[…]}` instead of `[…]`, or `null` on empty) used
// to fail *silently* until a render throw. The app-level ErrorBoundary now
// stops that from white-screening — these guards go one step further: they
// coerce responses to a stable shape at the boundary (so the `.map` can't
// throw) AND warn in dev when a coercion actually had to kick in, surfacing
// drift early instead of hiding it.
//
// This is deliberately not a full schema layer (no zod dependency). It's the
// 80/20: guarantee "lists are arrays, objects are objects" for the endpoints
// that feed the big pages.

const isDev = (() => {
  try {
    return Boolean(import.meta && import.meta.env && import.meta.env.DEV);
  } catch {
    return false;
  }
})();

function warnDrift(context, expected, got) {
  if (!isDev) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[api/shape] ${context}: expected ${expected} but got ${got === null ? "null" : Array.isArray(got) ? "array" : typeof got}. Coerced to a safe default — backend contract may have drifted.`
  );
}

/** Guarantee an array. Non-arrays coerce to [] (with a dev drift warning). */
export function asArray(value, context = "response") {
  if (Array.isArray(value)) return value;
  if (value !== undefined) warnDrift(context, "array", value);
  return [];
}

/** Guarantee a plain object. Arrays/primitives coerce to {} (dev-warned). */
export function asObject(value, context = "response") {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (value !== undefined) warnDrift(context, "object", value);
  return {};
}

/**
 * Extract a list from a response that may be a bare array OR a wrapper object
 * ({items|data|rows|results: [...]}). Returns [] (dev-warned) when no array is
 * found — the single most common shape-drift crash on this dashboard.
 */
export function listFrom(value, { keys = ["items", "data", "rows", "results"], context = "response" } = {}) {
  if (Array.isArray(value)) return value;
  const obj = value && typeof value === "object" ? value : null;
  if (obj) {
    for (const k of keys) {
      if (Array.isArray(obj[k])) return obj[k];
    }
  }
  if (value !== undefined) warnDrift(context, "array or {items:[…]}", value);
  return [];
}
