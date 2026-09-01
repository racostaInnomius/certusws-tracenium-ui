// src/utils/rankingSubtitle.js
//
// El subtítulo de la ventana "View all" de cualquier ranking.
//
// ⚠️ Existe porque las cinco ventanas de ranking del portal decían
// "Complete <algo> ranking" pasara lo que pasara. El backend limitaba las
// filas —6 en hardware, 8 en software— y la UI ofrecía "View all" a partir de
// la sexta: con 24 modelos de CPU distintos, o con 679 aplicaciones, esa
// ventana mostraba un puñado y afirmaba que eran todas.
//
// La frase sólo puede prometer lo que entrega, así que necesita saber cuántos
// valores distintos hay DE VERDAD. Ese número lo devuelve ahora cada endpoint
// de rankings junto a las filas.
//
// Vive en utils y no dentro de una página porque lo usan Hardware Inventory y
// Software Inventory, y una tercera copia es como se desincronizan.

/**
 * @param {Array}  items  las filas que la ventana va a mostrar
 * @param {number} total  cuántos valores distintos existen en la flota
 * @param {string} noun   qué se está contando, en plural ("manufacturers")
 */
export function rankingSubtitle(items, total, noun) {
  const shown = Array.isArray(items) ? items.length : 0;
  const all = Number(total);

  // Sin un total creíble no se afirma nada sobre completitud. Es el caso de
  // un backend viejo que todavía no manda la cifra: decir "todos" ahí sería
  // repetir exactamente el defecto que esta función arregla.
  if (!Number.isFinite(all) || all <= 0) {
    return `Showing ${shown} ${noun}.`;
  }

  if (all > shown) {
    return `Showing the top ${shown} of ${all} ${noun}.`;
  }

  return `All ${shown} ${noun} in the fleet.`;
}
