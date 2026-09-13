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

/** Medianoche local del primer día de una ventana de N días, en formato datetime-local. */
export function startOfWindowLocal(windowDays, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (Number(windowDays) - 1));
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`;
}
