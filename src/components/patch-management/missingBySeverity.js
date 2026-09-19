// src/components/patch-management/missingBySeverity.js
//
// Los parches pendientes de la flota, repartidos por severidad. PURO — sin
// React ni Recharts.
//
// ⚠️ LA UNIDAD ES EL PARCHE, NO EL EQUIPO. Es lo que lo hace un segundo chart y
// no una variante del donut: «OS patch status» cuenta EQUIPOS por estado (9
// equipos con actualizaciones), y esto cuenta el TRABAJO que hay detrás (esos 9
// equipos pueden deber 12 parches o 400). El backend los suma de
// `patch_management_scan_items`, un ítem por parche pendiente, así que un mismo
// equipo aporta tantos como le falten.
//
// ⚠️ NO FILTRA LA TABLA, a diferencia del donut. Filtrar por «moderate» exigiría
// saber qué equipos tienen al menos un parche moderado, y la fila de equipo solo
// trae el recuento de critical+important (`criticalCount`). Una barra que parece
// pulsable y no hace nada es peor que una que no lo parece.

/** Orden de lectura: lo que urge primero. */
export const SEVERITY_BANDS = Object.freeze([
  { key: "critical", label: "Critical", tone: "critical" },
  { key: "important", label: "Important", tone: "caution" },
  { key: "moderate", label: "Moderate", tone: "info" },
  { key: "low", label: "Low", tone: "muted" },
  { key: "unknown", label: "Unspecified", tone: "muted" },
]);

/**
 * Bandas que se pintan aunque valgan 0.
 *
 * «0 critical» es una respuesta que el operador busca, y callarla deja la duda
 * de si es que no hay o de si el chart no lo mide. Un 0 en `moderate` o `low`,
 * en cambio, es solo una fila vacía.
 */
const ALWAYS_SHOWN = new Set(["critical", "important"]);

/**
 * `{ bands, total, topShare }` — `bands` con `value` y `pct` (sobre el total de
 * pendientes), `topShare` el porcentaje que suman critical + important, que es
 * la frase que acompaña al chart.
 */
export function missingBySeverityData(severityBreakdown) {
  const b = severityBreakdown && typeof severityBreakdown === "object" ? severityBreakdown : {};

  const counted = SEVERITY_BANDS.map((band) => ({ ...band, value: Number(b[band.key]) || 0 }));
  const total = counted.reduce((sum, band) => sum + band.value, 0);

  const bands = counted
    .filter((band) => band.value > 0 || ALWAYS_SHOWN.has(band.key))
    .map((band) => ({
      ...band,
      // Sobre el total, no sobre la banda mayor: la barra dice qué PARTE del
      // trabajo pendiente es de esta severidad.
      pct: total > 0 ? (band.value / total) * 100 : 0,
    }));

  const urgent = (Number(b.critical) || 0) + (Number(b.important) || 0);
  return {
    bands,
    total,
    // Hacia abajo, como el donut: con 99,6% no se dice «100%».
    topShare: total > 0 ? Math.floor((urgent / total) * 100) : 0,
    urgent,
  };
}
