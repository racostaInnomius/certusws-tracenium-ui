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

import { BRAND, ROLE } from "../../theme/brand";

/**
 * El color de cada tono. Vive aquí, junto a las bandas, y no en el componente:
 * un tono sin relleno se pinta gris sin avisar, y el sitio donde se comprueba
 * que no falta ninguno es el mismo donde se declaran.
 *
 * ⚠️ El relleno `critical` es `errorText` (#B23A33) y no el rojo suave, por lo
 * que documenta InstallsOverTimeChart: el rojo suave contra el verde se separa
 * ΔE 3,1 para un deuteranope, que es no separarse. `attention` (naranja) y
 * `caution` (ámbar) se distinguen del rojo y entre sí por CLARIDAD.
 */
export const BAND_FILL = Object.freeze({
  positive: ROLE.positive,
  caution: ROLE.caution,
  attention: ROLE.attention,
  critical: BRAND.alert.errorText,
  info: BRAND.teal,
  muted: BRAND.gray,
});

/** Same order and meaning as the Status chip in the devices table. */
export const PATCH_STATUS_BANDS = Object.freeze([
  { key: "healthy", label: "Fully patched", tone: "positive" },
  { key: "updates_available", label: "Updates available", tone: "caution" },
  // ⚠️ «Reboot pending» NO es un fallo: el parche se instaló y sólo falta el
  // reinicio. Compartía el rojo de «Scan failed», así que la banda se leía como
  // una avería. Va en el naranja de «pide una acción» — por encima de «Updates
  // available», por debajo de lo que sí ha fallado. El resto del producto ya lo
  // trata así (en SDP, `reboot_required` cuenta como despliegue con éxito).
  { key: "reboot_required", label: "Reboot pending", tone: "attention" },
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
