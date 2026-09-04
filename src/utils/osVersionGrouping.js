// src/utils/osVersionGrouping.js
//
// La tarjeta "OS versions" agrupada primero por PLATAFORMA.
//
// ⚠️ Antes cada fila del backend era una fila de la tarjeta, y el backend
// agrupa por nombre comercial. En el tenant 1 eso partía macOS en tres filas de
// primer nivel: "macOS Tahoe" (6 equipos, ya agrupada), "macos 12.7.6" (1) y
// "macos 15.6.1" (1). Las dos últimas quedaban sueltas sólo por tener un equipo
// cada una, así que la tarjeta contestaba "¿qué versiones hay?" cuando la
// pregunta que se hace primero es "¿de qué está hecho el parque?".
//
// Ahora la plataforma es el primer nivel y las versiones se expanden debajo.
//
// ⚠️ Y cada fila lleva su PROPIO `searchTerm`. Antes el click deducía si una
// fila era hija mirando si traía `children`, con un comentario de doce líneas
// explicando la heurística. Con la plataforma como padre esa deducción deja de
// funcionar —un padre "macOS" no se busca igual que una versión— y en vez de
// hacerla más lista se elimina: quien construye la fila sabe qué hay que
// buscar, y lo dice.

/** Cuántos equipos declara una fila del backend. */
function hostCount(row) {
  const n = Number(row?.host_count ?? row?.count ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * El término con el que se filtra el detalle de Hardware Inventory.
 *
 * Para una versión concreta se prefiere el número técnico: es lo que la columna
 * `distro` contiene de verdad, y el nombre comercial de dos point releases
 * hermanas es idéntico, así que buscar por él no estrecharía nada.
 */
export function searchTermForVersion(row, displayTitle) {
  const tecnica = String(row?.technical_version ?? "").trim();
  if (tecnica) return tecnica;
  const version = String(row?.os_version ?? "").trim();
  if (version) return version;
  return displayTitle;
}

/**
 * Agrupa las filas de `summary.osVersions` por plataforma.
 *
 * @param rows        filas del backend
 * @param opciones.platformLabel  cómo se nombra una plataforma
 * @param opciones.displayTitle   cómo se nombra una fila de versión
 */
export function groupOsVersionsByPlatform(rows, opciones = {}) {
  const lista = Array.isArray(rows) ? rows : [];
  const nombrePlataforma = opciones.platformLabel || ((p) => p || "Unknown");
  const tituloVersion = opciones.displayTitle || ((r) => String(r?.os_label ?? "Unknown"));

  const porPlataforma = new Map();

  for (const row of lista) {
    // ⚠️ La clave de agrupación es la plataforma CRUDA, no la etiqueta bonita.
    // Dos plataformas distintas pueden compartir etiqueta según cómo se
    // nombren, y agrupar por el texto mostrado mezclaría cosas que el resto
    // del sistema mantiene separadas.
    const clave = String(row?.os_platform ?? "").toLowerCase() || "unknown";
    if (!porPlataforma.has(clave)) porPlataforma.set(clave, []);
    porPlataforma.get(clave).push(row);
  }

  const grupos = [];

  for (const [plataforma, filas] of porPlataforma) {
    const total = filas.reduce((acc, r) => acc + hostCount(r), 0);
    if (total === 0) continue;

    const versiones = filas
      .map((r) => {
        const titulo = tituloVersion(r);
        // Una fila que el backend ya agrupó trae sus point releases dentro.
        // No se abre un tercer nivel: se resume en la línea de apoyo, que es
        // donde cabe sin volver la tarjeta un árbol.
        const puntos = Array.isArray(r?.children)
          ? r.children.filter((c) => hostCount(c) > 0).length
          : 0;

        return {
          id: `${plataforma}-${r?.technical_version || r?.version_label || titulo}`,
          label: titulo,
          sub: puntos > 1 ? `${puntos} point releases` : String(r?.technical_version ?? "") || "",
          value: hostCount(r),
          searchTerm: searchTermForVersion(r, titulo),
          raw: r,
        };
      })
      .filter((v) => v.value > 0)
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

    const etiqueta = nombrePlataforma(plataforma);

    grupos.push({
      id: `platform-${plataforma}`,
      label: etiqueta,
      // Con una sola versión no hay nada que expandir: se dice cuál en la
      // línea de apoyo y la fila no ofrece un desplegable que no aporta.
      sub: versiones.length === 1 ? versiones[0].label : `${versiones.length} versions`,
      value: total,
      // ⚠️ `children` vacío y `children` ausente NO son lo mismo para
      // CompositionBars: un arreglo vacío sigue dibujando el desplegable.
      ...(versiones.length > 1 ? { children: versiones } : {}),
      // Buscar por la plataforma trae toda su gente; es lo que espera quien
      // hace clic en "macOS".
      searchTerm: etiqueta,
      platform: plataforma,
      raw: filas.length === 1 ? filas[0] : null,
    });
  }

  return grupos.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
