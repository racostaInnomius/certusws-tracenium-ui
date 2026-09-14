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

/**
 * Inicio de una ventana de N días TAL COMO LA CUENTAN LAS SERIES del backend
 * (días UTC: `date_trunc('day', NOW()) - (N-1) días`), escrito como
 * datetime-local, que es lo que lee el campo "From" de Audit.
 *
 * ⚠️ Era la medianoche LOCAL. Validado en el portal (14-sep 00:12 UTC, UTC-6):
 * la gráfica "Admin actions" sumaba 959 desde el 8-sep 00:00 UTC y el enlace
 * abría Audit desde el 7-sep 00:00 local — 12 horas antes — con 963.
 */
export function startOfWindowLocal(windowDays, now = new Date()) {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (Number(windowDays) - 1))
  );
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
