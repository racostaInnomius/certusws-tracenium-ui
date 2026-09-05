// Cómo se lee "cuándo arrancó este equipo".
//
// ⚠️ La pregunta real que trae a alguien a esta columna no es la fecha: es
// "¿cuánto lleva sin reiniciarse?". Un timestamp absoluto obliga a restar
// mentalmente en cada fila, así que se muestra la antigüedad y la fecha exacta
// queda en el tooltip.
//
// ⚠️ Y "no se sabe" NO es "nunca". Los agentes por debajo de 1.1.61 no mandan
// el dato, así que durante todo el despliegue la mayoría de la flota llegará
// con null. Pintar eso como "hace mucho" convertiría media flota en equipos
// abandonados; pintarlo como un guion vacío y NO teñirlo es lo honesto.

/** A partir de aquí, un equipo lleva demasiado sin reiniciarse. */
export const STALE_BOOT_DAYS = 30;

export function describeLastBoot(lastBootUtc, nowMs = Date.now()) {
  if (typeof lastBootUtc !== "string" || lastBootUtc.trim() === "") {
    return { known: false, label: "—", title: "Not reported by this agent", stale: false, days: null };
  }

  const bootMs = Date.parse(lastBootUtc);
  if (!Number.isFinite(bootMs)) {
    return { known: false, label: "—", title: "Not reported by this agent", stale: false, days: null };
  }

  const days = Math.floor((nowMs - bootMs) / 86_400_000);
  // Un arranque en el futuro es desfase de reloj. El backend ya descarta lo
  // absurdo, pero unos minutos de adelanto sí pasan: se muestran como "today",
  // que es lo que un operador entiende, y no como "hace -1 días".
  const label =
    days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;

  return {
    known: true,
    label,
    title: new Date(bootMs).toLocaleString(),
    stale: days >= STALE_BOOT_DAYS,
    days
  };
}
