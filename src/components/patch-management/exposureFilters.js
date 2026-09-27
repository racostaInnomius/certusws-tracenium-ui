// src/components/patch-management/exposureFilters.js
//
// Buscar, filtrar y paginar la tabla de Vulnerabilities.
//
// 🔴 T1, 25-sep: la tabla pintaba las 6.037 filas de golpe, sin buscador ni
// filtros. Para encontrar un CVE o un equipo había que hacer scroll por miles de
// filas, y la API ya tardaba 4,5 s. Todo llega en una respuesta, así que filtrar
// y paginar en el cliente no cuesta viajes.

export const EXPOSURE_PAGE_SIZES = [25, 50, 100];

export const EMPTY_EXPOSURE_FILTERS = Object.freeze({
  query: "",
  severity: "all",
  platform: "all",
  exploitedOnly: false,
});

/**
 * ¿Pasa la fila los filtros? La búsqueda mira el CVE, el software y los equipos
 * de la muestra — el operador suele llegar con un nombre de equipo.
 */
function matches(row, f) {
  if (f.severity !== "all" && String(row.severity || "").toLowerCase() !== f.severity) return false;
  if (f.platform !== "all" && String(row.platform || "").toLowerCase() !== f.platform) return false;
  if (f.exploitedOnly && row.knownExploited !== true) return false;
  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.cveId,
    row.title,
    ...(row.sampleDevices || []).map((d) => d?.hostname || d?.agentId),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function filterExposureRows(rows, filters = EMPTY_EXPOSURE_FILTERS) {
  const f = { ...EMPTY_EXPOSURE_FILTERS, ...filters };
  return (rows || []).filter((r) => matches(r, f));
}

export function hasActiveExposureFilters(filters) {
  const f = { ...EMPTY_EXPOSURE_FILTERS, ...filters };
  return f.query.trim() !== "" || f.severity !== "all" || f.platform !== "all" || f.exploitedOnly;
}

/** Las plataformas que de verdad aparecen, para no ofrecer un filtro vacío. */
export function exposurePlatforms(rows) {
  return Array.from(new Set((rows || []).map((r) => String(r.platform || "").toLowerCase()).filter(Boolean))).sort();
}

/** La página en la que cae una fila — para llevar ahí a quien llega con un CVE. */
export function pageOfRow(rows, predicate, pageSize) {
  const i = (rows || []).findIndex(predicate);
  return i < 0 ? -1 : Math.floor(i / pageSize);
}
