// src/utils/locationSiteChecks.js
//
// Un sitio no puede estar en dos lugares.
//
// ⚠️ Existe por un caso real. El tenant 111 tenía cinco reglas del sitio
// "Mountainside IG": cuatro con longitud -97.973760 y una con +97.973760 —un
// signo menos que faltaba al capturar—. Lat 26.17 con longitud positiva cae en
// la frontera de Myanmar con China, así que dos equipos de esa VLAN aparecían
// en Asia en el mapa. Nadie ve un signo que falta en un formulario; se
// descubrió persiguiendo el síntoma.
//
// La forma general del error es detectable sin ambigüedad: si dos reglas
// declaran el MISMO nombre de sitio con coordenadas distintas, una de las dos
// está mal. No hay caso legítimo — un sitio con dos ubicaciones son dos sitios
// y merecen dos nombres.
//
// Es una comprobación de LECTURA, no una validación de guardado. Bloquear al
// guardar obligaría a mover las cinco reglas de un sitio en una sola operación
// atómica; avisar deja corregir a ritmo humano, que es como se corrige esto.

/**
 * Cuánta separación se tolera entre dos reglas del mismo sitio.
 *
 * No es cero a propósito: dos edificios de un mismo campus capturados con
 * coordenadas ligeramente distintas son la misma "sede" para quien mira el
 * mapa, y avisar de eso sería ruido. Un error de captura —un signo, un dígito
 * de más— produce siempre saltos de cientos o miles de kilómetros.
 */
export const SAME_SITE_TOLERANCE_KM = 25;

/**
 * Una coordenada, o null si no la hay.
 *
 * ⚠️ No basta con Number.isFinite(Number(v)): Number(null) es 0 y Number("")
 * tambien, asi que una coordenada AUSENTE se leeria como el meridiano cero y
 * dos reglas sin coordenadas parecerian estar las dos en Null Island. Es la
 * misma confusion entre "no hay dato" y "el dato es cero" que ya mordio en el
 * uso de disco.
 */
function coord(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Distancia aproximada en km. Equirectangular basta a esta escala. */
export function approxDistanceKm(a, b) {
  const latA = coord(a?.lat);
  const lonA = coord(a?.lon);
  const latB = coord(b?.lat);
  const lonB = coord(b?.lon);
  if ([latA, lonA, latB, lonB].some((v) => v === null)) return null;

  const medLat = ((latA + latB) / 2) * (Math.PI / 180);
  const dLat = latA - latB;
  const dLon = (lonA - lonB) * Math.cos(medLat);
  return 111.045 * Math.sqrt(dLat * dLat + dLon * dLon);
}

const hasCoords = (r) => coord(r?.lat) !== null && coord(r?.lon) !== null;

/**
 * Los sitios cuyas reglas se contradicen.
 *
 * Devuelve, por cada nombre de sitio en conflicto, las reglas implicadas y la
 * separación máxima entre ellas. Un arreglo vacío significa que el catálogo es
 * coherente — no que no se pudo comprobar.
 */
export function findDivergentSites(rows, toleranceKm = SAME_SITE_TOLERANCE_KM) {
  const lista = Array.isArray(rows) ? rows : [];
  const porNombre = new Map();

  for (const row of lista) {
    // Sin coordenadas no hay contradicción posible: una regla que sólo pone
    // nombre a una subred es legítima y frecuente.
    if (!hasCoords(row)) continue;
    const nombre = String(row?.siteName ?? "").trim();
    if (!nombre) continue;

    const key = nombre.toLowerCase();
    if (!porNombre.has(key)) porNombre.set(key, []);
    porNombre.get(key).push(row);
  }

  const conflictos = [];

  for (const reglas of porNombre.values()) {
    if (reglas.length < 2) continue;

    let peor = 0;
    let par = null;
    for (let i = 0; i < reglas.length; i++) {
      for (let j = i + 1; j < reglas.length; j++) {
        const d = approxDistanceKm(reglas[i], reglas[j]);
        if (d != null && d > peor) {
          peor = d;
          par = [reglas[i], reglas[j]];
        }
      }
    }

    if (peor > toleranceKm && par) {
      conflictos.push({
        siteName: String(reglas[0]?.siteName ?? "").trim(),
        maxDistanceKm: Math.round(peor),
        rules: reglas,
        // Las dos reglas más separadas: son las que hay que mirar primero, y
        // en el caso real son exactamente la buena y la del signo perdido.
        farthest: par,
      });
    }
  }

  return conflictos.sort((a, b) => b.maxDistanceKm - a.maxDistanceKm);
}

/** ¿Esta regla participa en algún conflicto? Para marcarla en la tabla. */
export function isRuleDivergent(row, conflicts) {
  if (!row || !Array.isArray(conflicts)) return false;
  return conflicts.some((c) => c.rules.some((r) => r === row || (r?.id != null && r.id === row.id)));
}
