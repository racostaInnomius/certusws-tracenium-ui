// src/components/AssetsDashboard/softwareSort.js
//
// Ficha del equipo › Software. Orden, búsqueda y paginación van al SERVIDOR
// (?sortBy, ?sortDir, ?search): la tabla trae 15 de N apps, y ordenar o
// filtrar sólo esas 15 diría algo falso de las demás. Las columnas válidas
// son las de hostAppsOrderBy en el backend.

export const SOFTWARE_PAGE_SIZE = 15;

/** El orden que el servidor daba siempre: lo detectado más reciente primero. */
export const DEFAULT_SOFTWARE_SORT = Object.freeze({ by: "detectedAtUtc", dir: "desc" });

// Las fechas empiezan por lo más reciente; el texto, de la A a la Z.
export const SOFTWARE_DATE_COLUMNS = new Set(["installedOn", "detectedAtUtc"]);

/** Pulsar una cabecera: la misma columna invierte el sentido; otra empieza en el suyo. */
export function nextSoftwareSort(prev, field) {
  if (prev?.by === field) return { by: field, dir: prev.dir === "asc" ? "desc" : "asc" };
  return { by: field, dir: SOFTWARE_DATE_COLUMNS.has(field) ? "desc" : "asc" };
}
