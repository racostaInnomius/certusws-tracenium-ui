// src/components/software-delivery/deploymentSchedule.js
//
// Programar un envío: la hora que elige el operador y la frase que explica por
// qué algo no ha salido todavía.
//
// ── Por qué está aquí y no dentro de un componente ───────────────────────
//
// Las dos cosas se pueden equivocar SIN DAR ERROR, que es la definición de lo
// que merece un módulo puro con pruebas:
//
//   · La conversión de la hora. El `<input type="datetime-local">` devuelve
//     una hora de pared SIN ZONA — "2026-09-22T22:00" — y el backend la
//     rechaza a propósito, porque sin offset significaría la hora local DEL
//     SERVIDOR. Convertirla mal no rompe nada: manda el envío seis horas antes.
//   · La frase. `scheduled` significa dos cosas desde que se puede programar, y
//     decir «esperando la ventana de mantenimiento» de algo que el operador
//     programó para el martes es peor que no decir nada.

/** El mismo tope que aplica el backend (`schedule-plan.ts`). */
export const MAX_SCHEDULE_HORIZON_DAYS = 30;

/** Hora de pared local en el formato que espera `datetime-local`. */
export function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Lo que el operador escribió → el instante que viaja al backend.
 *
 * ⚠️ LA HORA QUE ESCRIBE ES LA SUYA, la de su navegador, y eso es lo que
 * espera: «a las 22:00» significa las 22:00 donde él está. `new Date(valor)`
 * con una cadena sin zona la interpreta justo así, y `toISOString()` le pone
 * la Z. Cualquier otro camino —pegar la cadena tal cual, añadir un offset a
 * mano— manda un envío a una hora que nadie pidió.
 */
export function parseScheduleInput(value, now = new Date()) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false, message: "Pick a date and time." };

  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return { ok: false, message: "That isn't a valid date and time." };

  if (at.getTime() <= now.getTime()) {
    return { ok: false, message: "That time has already passed — pick a later one, or send now." };
  }

  const horizonMs = MAX_SCHEDULE_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  if (at.getTime() - now.getTime() > horizonMs) {
    return {
      ok: false,
      message: `Too far out — the package is frozen when the deployment is created, so ${MAX_SCHEDULE_HORIZON_DAYS} days is the limit.`,
    };
  }

  return { ok: true, iso: at.toISOString(), at };
}

/**
 * Cuándo va a salir esto, en la pantalla donde se confirma.
 *
 * ⚠️ LA COMBINACIÓN ES LA QUE ENGAÑA. Con hora Y ventana, el envío sale en la
 * MÁS TARDÍA de las dos: prometer sólo la hora sería mentir la noche que la
 * ventana esté cerrada, que es justo cuando alguien marca las dos cosas.
 */
export function dispatchSentence({ at, waitForWindow }, formatTime) {
  if (at && waitForWindow) {
    return `Goes out at ${formatTime(at)}, or when the next maintenance window opens after that.`;
  }
  if (at) return `Goes out at ${formatTime(at)}.`;
  if (waitForWindow) return "Held until the tenant's next maintenance window opens.";
  return "Dispatches now — maintenance windows are not applied.";
}

/**
 * Por qué este despliegue no se ha movido, en una frase, o null si se está
 * moviendo.
 *
 * ⚠️ `scheduledReason` ausente es lo ANTIGUO, y lo antiguo lo retenía siempre
 * la ventana: tratarlo como «programado por alguien» le atribuiría al operador
 * una decisión que no tomó.
 */
export function waitingReason(deployment, formatTime) {
  if (deployment?.status !== "scheduled") return null;
  const when = deployment?.scheduledAt ? formatTime(deployment.scheduledAt) : null;

  if (deployment?.scheduledReason === "user") {
    return when ? `Scheduled — dispatches ${when}` : "Scheduled to dispatch later";
  }
  return when
    ? `Waiting for the maintenance window — dispatches ${when}`
    : "Waiting for the maintenance window to open";
}
