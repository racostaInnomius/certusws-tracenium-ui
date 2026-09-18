// src/components/patch-management/patchStatusChart.js
//
// The fleet's patch status as chart data. PURE — no React, no Recharts.
//
// The question it answers, which no number on the page answered before: how
// much of the fleet is actually done? The devices table has the Status column
// per device; this is the same column counted.
//
// ⚠️ «Done» is ONLY `healthy`. The tempting shortcut — «anything that isn't
// updates_available is fine» — would count as patched a device whose scan
// errored (it arrives with zero pending patches, so it looks clean), one that
// only ever shipped an inventory, and one still waiting for its restart. Those
// three are «not known to be patched», and they get their own band.

/** Same order and meaning as the Status chip in the devices table. */
export const PATCH_STATUS_BANDS = Object.freeze([
  { key: "healthy", label: "Fully patched", tone: "positive" },
  { key: "updates_available", label: "Updates available", tone: "caution" },
  { key: "reboot_required", label: "Reboot pending", tone: "critical" },
  { key: "installing", label: "Installing", tone: "info" },
  { key: "scan_pending", label: "Scan pending", tone: "info" },
  { key: "error", label: "Scan failed", tone: "critical" },
  { key: "inventory_only", label: "Inventory only", tone: "muted" },
  { key: "idle", label: "Idle", tone: "muted" },
  { key: "unknown", label: "Unknown", tone: "muted" },
]);

/** Buckets that do NOT prove a device is patched, beyond the obvious ones. */
const NOT_KNOWN_PATCHED = new Set(["error", "inventory_only", "idle", "unknown", "scan_pending"]);

/**
 * `{ segments, reporting, patched, patchedPct, notKnown }`.
 *
 * `segments` keeps only the bands that exist — a legend of zeros is noise — and
 * is empty when nothing reports, so the caller can say so instead of drawing an
 * empty donut.
 */
export function patchStatusChartData(statusBreakdown) {
  const b = statusBreakdown && typeof statusBreakdown === "object" ? statusBreakdown : {};
  const segments = [];
  let reporting = 0;
  let notKnown = 0;

  for (const band of PATCH_STATUS_BANDS) {
    const value = Number(b[band.key]) || 0;
    reporting += value;
    if (NOT_KNOWN_PATCHED.has(band.key)) notKnown += value;
    if (value > 0) segments.push({ ...band, value });
  }

  const patched = Number(b.healthy) || 0;
  return {
    segments,
    reporting,
    patched,
    // Redondeo hacia abajo: con 99,6% no se dice «100%».
    patchedPct: reporting > 0 ? Math.floor((patched / reporting) * 100) : 0,
    notKnown,
  };
}
