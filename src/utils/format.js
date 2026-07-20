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
 */
export function formatDate(value, options) {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return d.toLocaleString(
    "en-US",
    options ?? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
  );
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
