// src/utils/format.js
//
// Canonical formatting helpers. These were copy-pasted across 7-11 files each
// with subtly different edge-case behavior (formatBytesToGb returned "—" in
// one page and "0 GB" in another for the same missing value). One home, one
// behavior. Missing/invalid values render as an em-dash "—" everywhere.

export const EMPTY = "—";

/**
 * Auto-unit byte formatter (B / KB / MB / GB / TB). Invalid/negative → "—".
 */
export function formatBytes(n) {
  if (n == null || n === "") return EMPTY;
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return EMPTY;
  if (num < 1024) return `${num} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let v = num / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

/**
 * Fixed-GB formatter. Invalid or ≤ 0 → "—" (a missing disk is unknown, not
 * "0 GB"). Canonicalizes the AssetsDashboard behavior over HardwareInventory's.
 */
export function formatBytesToGb(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return EMPTY;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/**
 * Locale date-time. Invalid/empty → "—".
 *
 * ⚠️ Era «Sep 24, 26, 18:17»: el año a dos cifras junto al día se lee como
 * otro día (recorrido de Patch Management, 25-sep). Ahora el año sólo sale
 * cuando NO es el actual, y entonces entero: «Sep 24, 18:17» /
 * «Dec 03, 2025, 09:10». Igual de compacto en el caso común y sin ambigüedad.
 * Pass `options` to override (e.g. Audit adds seconds).
 */
const DEFAULT_DATE_OPTS = {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

function stamp(value, base, now) {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleString("en-US", sameYear ? base : { ...base, year: "numeric" });
}

export function formatDate(value, options, now = new Date()) {
  if (options) {
    if (!value) return EMPTY;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? EMPTY : d.toLocaleString("en-US", options);
  }
  return stamp(value, DEFAULT_DATE_OPTS, now);
}

/**
 * Lo mismo con segundos, para las vistas que los necesitan (Audit, el detalle
 * de un despliegue). Tenían formateador propio con el año a dos cifras —
 * «Sep 28, 26, 16:44:03»— y seguían así tras arreglar `formatDate` (28-sep).
 */
export function formatDateSeconds(value, now = new Date()) {
  return stamp(value, { ...DEFAULT_DATE_OPTS, second: "2-digit" }, now);
}

/**
 * Un día de calendario "YYYY-MM-DD" (sin hora), p. ej. la fecha de instalación
 * de una app → "Mar 15, 2024". Inválido/vacío → "—".
 *
 * ⚠️ NO pasa por `new Date("2024-03-15")`: esa forma se lee como medianoche
 * UTC, y al pintarla en hora local cualquier zona al oeste de Greenwich —todo
 * México— ve el día ANTERIOR. Se construye la fecha local a partir de las
 * partes, así que el día que se ve es el que mandó el equipo.
 */
export function formatCalendarDay(value) {
  const m = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return EMPTY;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return EMPTY;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

/**
 * Coarse relative time ("just now", "5m ago", "3h ago", "2d ago"), else an
 * absolute date. Invalid/empty → "—".
 */
export function formatRelative(value) {
  if (!value) return EMPTY;
  const d = new Date(value);
  const t = d.getTime();
  if (Number.isNaN(t)) return EMPTY;
  const diffMs = Date.now() - t;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 0) return formatDate(value);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatDate(value, { year: "numeric", month: "short", day: "numeric" });
}
