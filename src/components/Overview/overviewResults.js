// src/components/Overview/overviewResults.js
//
// Helpers to thread the raw allSettled results into concrete KPI values
// without spraying optional chaining across the component. Each helper
// returns `null` when the backing endpoint failed so the card falls
// through to the skeleton/zero state rather than displaying garbage.
export function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

export function formatPct(num) {
  if (!Number.isFinite(num)) return "—";
  return `${Math.round(num)}%`;
}

export const listLength = (value) =>
  Array.isArray(value?.items) ? value.items.length : Array.isArray(value) ? value.length : 0;
