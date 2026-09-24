// src/components/Compliance/bulkFixPlan.js
//
// Qué se puede arreglar de lo que el operador marcó, y qué no.
//
// La selección de la ficha de un equipo es heterogénea: hay hallazgos con
// handler, otros que sólo dan fichero porque su clave está guardada, otros
// que son trabajo manual, y algunos que ya no fallan. Un «Apply all» que
// callara eso prometería diez arreglos y haría seis.
//
// Por eso el reparto vive aquí, separado del diálogo y probado aparte: es lo
// que se enseña ANTES de pulsar, y lo que decide qué checks viajan al lote.

/**
 * @param {Array} findings hallazgos seleccionados, tal y como los pinta la ficha
 * @returns {{applicable: Array, guarded: Array, manual: Array, notFailing: Array, checkIds: string[]}}
 */
export function bulkFixPlan(findings) {
  const applicable = [];
  const guarded = [];
  const manual = [];
  const notFailing = [];

  for (const f of findings ?? []) {
    if (!f?.checkId) continue;
    // Sólo se arregla lo que falla HOY. Un hallazgo ya remediado o aceptado
    // sigue en la lista por historial; volver a escribirle el valor sería
    // trabajo en un equipo que no lo necesita.
    if (f.status !== "fail") { notFailing.push(f); continue; }
    if (f.agentRemediable) { applicable.push(f); continue; }
    // Guardado: hay plan y artefacto (.reg/.inf), pero no botón — lo aplica
    // una persona que ha leído por qué.
    if (f.remediationPlan?.guard) { guarded.push(f); continue; }
    manual.push(f);
  }

  return {
    applicable,
    guarded,
    manual,
    notFailing,
    checkIds: [...new Set(applicable.map((f) => f.checkId))],
  };
}

/** El resumen en una frase, sin partes en cero. */
export function bulkFixSummary(plan) {
  const bits = [];
  if (plan.applicable.length) bits.push(`${plan.applicable.length} can be applied from here`);
  if (plan.guarded.length) bits.push(`${plan.guarded.length} export as a file (guarded)`);
  if (plan.manual.length) bits.push(`${plan.manual.length} need a person`);
  if (plan.notFailing.length) bits.push(`${plan.notFailing.length} no longer failing`);
  return bits.join(" · ");
}

/** ¿Han terminado todas las remediaciones del lote? */
export function batchFinished(items) {
  const TERMINAL = new Set(["completed", "failed", "cancelled", "timed_out"]);
  return Array.isArray(items) && items.length > 0
    && items.every((r) => TERMINAL.has(String(r?.status)));
}
