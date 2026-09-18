// src/components/patch-management/deviceCardFilter.js
//
// Las tarjetas de «Fleet totals» como filtros de la tabla de equipos. Puro.
//
// ⚠️ DOS TARJETAS CUENTAN PARCHES Y EL FILTRO ENSEÑA EQUIPOS.
// «Total missing» y «Critical / Important» suman parches de toda la flota; al
// pulsarlas, la tabla muestra los EQUIPOS que tienen alguno. En T111 (15-sep):
// 31 parches pendientes → 18 equipos, 21 críticos/importantes → 11 equipos. Por
// eso el rótulo del filtro dice «Devices with…» y no repite el título de la
// tarjeta: «Total missing: 31» encima de una tabla de 18 filas sin explicar se
// leería como un error.
//
// «Reboot pending» y «Healthy» sí cuentan equipos, por `overall_status`, que es
// exactamente el campo que filtra: número y filas coinciden.

export const DEVICE_CARD_FILTERS = {
  missing: {
    label: "Devices with missing patches",
    test: (d) => Number(d?.missingCount) > 0,
  },
  critical: {
    label: "Devices with critical / important patches",
    test: (d) => Number(d?.criticalCount) > 0,
  },
  reboot: {
    label: "Reboot pending",
    test: (d) => d?.overallStatus === "reboot_required",
  },
  healthy: {
    label: "Healthy",
    test: (d) => d?.overallStatus === "healthy",
  },
};

/**
 * Prefijo para filtrar por un `overall_status` que no tiene tarjeta propia
 * («Updates available», «Scan failed»…). Lo usa el donut de estado del SO.
 *
 * ⚠️ Una sola dimensión de filtro a propósito: las tarjetas y el donut
 * comparten estado, así que no hay dos filtros compitiendo ni un chip que
 * contradiga al otro. Y las bandas que YA tienen tarjeta reutilizan su tecla,
 * de modo que pulsar la banda deja la tarjeta marcada igual.
 */
export const STATUS_FILTER_PREFIX = "status:";

const STATUS_WITH_CARD = { healthy: "healthy", reboot_required: "reboot" };

/** La tecla de filtro para un estado del donut. */
export function cardFilterForStatus(status) {
  const s = String(status ?? "").trim();
  if (!s) return null;
  return STATUS_WITH_CARD[s] ?? `${STATUS_FILTER_PREFIX}${s}`;
}

/** El estado que representa una tecla de filtro, si representa alguno. */
export function statusOfCardFilter(key) {
  const k = String(key ?? "");
  if (k.startsWith(STATUS_FILTER_PREFIX)) return k.slice(STATUS_FILTER_PREFIX.length);
  for (const [status, card] of Object.entries(STATUS_WITH_CARD)) if (card === k) return status;
  return null;
}

export function applyDeviceCardFilter(devices, key) {
  const list = Array.isArray(devices) ? devices : [];
  if (!key) return list;
  if (String(key).startsWith(STATUS_FILTER_PREFIX)) {
    const status = String(key).slice(STATUS_FILTER_PREFIX.length);
    return list.filter((d) => d?.overallStatus === status);
  }
  const f = DEVICE_CARD_FILTERS[key];
  return f ? list.filter(f.test) : list;
}

/** Pulsar la tarjeta activa la apaga; pulsar otra la sustituye. */
export function toggleCardFilter(current, key) {
  return current === key ? null : key;
}

/**
 * ¿Trae el backend el conteo de críticos por equipo?
 *
 * Contra un backend anterior el campo no existe, y filtrar por él vaciaría la
 * tabla bajo una tarjeta que dice «21». Mejor que esa tarjeta no sea pulsable.
 */
export function hasCriticalCounts(devices) {
  return Array.isArray(devices) && devices.some((d) => d && d.criticalCount !== undefined);
}

/**
 * El rótulo del chip de filtro. Un filtro por estado dice de qué estado se
 * trata con la misma palabra que la columna Status de la tabla, no con la clave
 * interna: «Status: Scan failed», no «status:error».
 */
export function deviceFilterLabel(key, statusLabel = (s) => s) {
  if (!key) return "";
  const status = statusOfCardFilter(key);
  if (status && !DEVICE_CARD_FILTERS[key]) return `Status: ${statusLabel(status)}`;
  return DEVICE_CARD_FILTERS[key]?.label || String(key);
}
