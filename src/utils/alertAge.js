// src/utils/alertAge.js
//
// Cuánto lleva abierta una alerta.
//
// ⚠️ NO ES LO MISMO QUE "When", y esa es la razón de que exista una
// columna aparte. `occurredAt` en una fuente de estado es un derivado de
// la CONDICIÓN —la fecha de caducidad del certificado, el momento en que
// se midió el disco—, no cuándo empezó a estar mal. Una alerta puede
// llevar tres semanas abierta y traer un `occurredAt` de hace un rato.
// `firstSeenAt` viene de `alert_occurrences` y es la primera vez que el
// tick horario la vio.
//
// Vive en un módulo propio y no dentro de la página porque el umbral de
// "esto lleva demasiado" es una regla de producto que merece test, no un
// ternario enterrado en una celda de tabla.

/**
 * A partir de cuántos días una alerta abierta deja de ser normal.
 *
 * Siete y no treinta: el tick corre cada hora y las fuentes de estado se
 * cierran solas cuando la condición se arregla, así que una alerta que
 * sobrevive una semana entera ya no es "todavía no le ha dado tiempo a
 * nadie", es que nadie la está mirando.
 */
export const STALE_AFTER_DAYS = 7;

/**
 * @param {string|null|undefined} firstSeenAt ISO-8601, o null si el tick
 *   todavía no ha registrado esta alerta.
 * @param {number} [now] milisegundos, inyectable para poder testear.
 * @returns {{text: string, days: number, stale: boolean} | null}
 *   `null` cuando no hay edad que enseñar — el llamador decide cómo
 *   pintar esa ausencia, que no es lo mismo que una edad de cero.
 */
export function formatOpenFor(firstSeenAt, now = Date.now()) {
  if (!firstSeenAt) return null;
  const t = Date.parse(firstSeenAt);
  if (!Number.isFinite(t)) return null;

  const delta = now - t;
  // Un reloj adelantado en el servidor no debe pintar "abierta hace -3h".
  // Se trata como recién abierta, que es lo que casi seguro es.
  if (delta < 0) return { text: "just now", days: 0, stale: false };

  const mins = Math.floor(delta / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let text;
  if (mins < 60) text = mins < 1 ? "just now" : `${mins}m`;
  else if (hours < 24) text = `${hours}h`;
  else if (days < 30) text = `${days}d`;
  else {
    const months = Math.floor(days / 30);
    text = months < 12 ? `${months}mo` : `${Math.floor(months / 12)}y`;
  }

  return { text, days, stale: days >= STALE_AFTER_DAYS };
}
