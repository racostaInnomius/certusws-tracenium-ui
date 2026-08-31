// src/components/RemoteControl/recordingPlayback.js
//
// Lógica pura del reproductor de grabaciones (ADR-0012). Sin React y sin
// canvas: la parte que decide QUÉ fotogramas hay que pintar, que es donde
// están los errores caros y donde se puede probar de verdad.
//
// ── Por qué buscar hacia atrás no es opcional ────────────────────────
//
//   Los fotogramas parciales se pintan ENCIMA del estado anterior. Saltar
//   directamente al minuto 7 y pintar el fotograma de ese instante da una
//   región de 40×20 píxeles sobre un lienzo vacío — no "el minuto 7".
//
//   Para colocarse en un instante hay que volver al último fotograma COMPLETO
//   anterior y repintar desde ahí. Por eso el agente conserva un completo por
//   segundo aunque en Windows sean casi redundantes: son los únicos puntos
//   por los que se puede entrar.

/** Índice del último fotograma completo en o antes de `frames[i]`. */
export function lastKeyframeAtOrBefore(frames, index) {
  for (let i = Math.min(index, frames.length - 1); i >= 0; i--) {
    if (frames[i]?.full) return i;
  }
  // Sin ningún completo no hay base sobre la que pintar. Devolver 0 sería
  // fingir que la hay; -1 obliga al llamador a decidir qué enseñar.
  return -1;
}

/** Índice del último fotograma cuyo tiempo es <= t. */
export function frameIndexAt(frames, t) {
  if (frames.length === 0) return -1;
  let lo = 0;
  let hi = frames.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * Qué hay que pintar para mostrar el instante `t`, viniendo de `fromIndex`.
 *
 * Devuelve el rango [start, end] de índices a pintar EN ORDEN, y si hace falta
 * limpiar el lienzo antes.
 *
 * Avanzar hacia adelante desde donde ya estamos solo pinta lo nuevo — que es
 * lo que hace que la reproducción normal sea barata. Retroceder, o saltar,
 * obliga a volver al último completo: es más caro y es la única forma correcta.
 */
export function seekPlan(frames, fromIndex, t) {
  const target = frameIndexAt(frames, t);
  if (target < 0) return { clear: true, start: 0, end: -1, target: -1 };

  // Continuación normal: seguimos hacia adelante desde donde estábamos.
  if (fromIndex >= 0 && target >= fromIndex) {
    return { clear: false, start: fromIndex + 1, end: target, target };
  }

  // Salto hacia atrás (o primer pintado): hay que reconstruir desde el último
  // completo. Sin esto se verían regiones sueltas sobre un lienzo con restos
  // de otro momento de la sesión, que es peor que no enseñar nada porque
  // parece una pantalla real.
  const key = lastKeyframeAtOrBefore(frames, target);
  if (key < 0) return { clear: true, start: 0, end: -1, target: -1 };
  return { clear: true, start: key, end: target, target };
}

/** Duración total, en ms. 0 si no hay fotogramas. */
export function totalDuration(frames) {
  return frames.length > 0 ? frames[frames.length - 1].t : 0;
}

/**
 * Texto para el operador sobre en qué puede confiar.
 *
 * Se enseña SIEMPRE que algo no cuadre, no solo cuando falla del todo. Una
 * grabación truncada o sin integridad verificada sigue siendo útil —media
 * sesión es media sesión— pero quien la mira tiene que saber qué está viendo
 * antes de sacar conclusiones. Callarlo convertiría una prueba parcial en una
 * prueba aparentemente completa.
 */
export function integrityNotice({ truncated, integrityOk, clean }) {
  const parts = [];
  if (integrityOk === false) {
    parts.push(
      "The stored file does not match the checksum the endpoint reported. " +
        "Treat what you see as unverified."
    );
  }
  if (clean === false) {
    parts.push(
      "Playback stopped early: the recording could not be read to the end. " +
        "Everything shown up to that point is intact."
    );
  }
  if (truncated) {
    parts.push(
      "The endpoint stopped recording before the session ended (disk limit or " +
        "interruption), so this does not cover the whole session."
    );
  }
  return parts.join(" ");
}
