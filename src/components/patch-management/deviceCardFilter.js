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

export function applyDeviceCardFilter(devices, key) {
  const list = Array.isArray(devices) ? devices : [];
  const f = key ? DEVICE_CARD_FILTERS[key] : null;
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
