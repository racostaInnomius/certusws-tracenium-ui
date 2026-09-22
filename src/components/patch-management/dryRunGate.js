// src/components/patch-management/dryRunGate.js
//
// Simular primero, aplicar después — y aplicar SÓLO donde la simulación dijo
// que había algo que cambiar.
//
// Antes cuatro botones mandaban `apply` a secas: el drawer de la rejilla PMP,
// el hub «Fix», el «Fix now» de un equipo y el «Fix N» de flota en Security
// Compliance. Con handlers que en su mayoría nunca se han ejercido en esta
// instalación, eso es descubrir un fallo en doce equipos en vez de en uno.
//
// La regla aquí: el conjunto de `apply` sale del resultado de la simulación,
// no de la selección. Un equipo que ya cumple, que falló la simulación o que
// no contestó no se toca: su resultado se ve y se decide a mano.

export const DRY_RUN_TERMINAL = new Set([
  "dryrun_would_apply",
  "dryrun_already_compliant",
  "failed",
  "rejected",
  "timed_out",
  "cancelled",
]);

/** ¿Ha terminado la simulación en todos los equipos? */
export function dryRunFinished(results) {
  return Array.isArray(results) && results.length > 0
    && results.every((r) => DRY_RUN_TERMINAL.has(r.outcome));
}

/** Los equipos donde aplicar: los que la simulación dice que cambiarían. */
export function devicesToApplyAfterDryRun(results) {
  if (!Array.isArray(results)) return [];
  return [...new Set(
    results.filter((r) => r.outcome === "dryrun_would_apply").map((r) => r.deviceId).filter(Boolean)
  )];
}

/** Lo que se queda fuera del apply, contado por motivo, para decirlo. */
export function dryRunLeftOut(results) {
  const out = { compliant: 0, failed: 0 };
  for (const r of results ?? []) {
    if (r.outcome === "dryrun_already_compliant") out.compliant += 1;
    else if (r.outcome !== "dryrun_would_apply") out.failed += 1;
  }
  return out;
}
