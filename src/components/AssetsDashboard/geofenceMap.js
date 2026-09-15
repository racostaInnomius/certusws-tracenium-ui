// Las decisiones del mapa de geocercas que no son dibujo: qué sitio entra, de
// qué color, y qué encuadre.

const METROS_POR_GRADO = 111_320;

export function sitiosConPin(sites) {
  return (Array.isArray(sites) ? sites : []).filter(
    (s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon)
  );
}

/**
 * Cómo se pinta un sitio en el mapa.
 *
 * ⚠️ Sólo se dibuja el radio GUARDADO. El sugerido es un consejo, no una cerca:
 * pintarlo haría creer que el sitio ya vigila esa área.
 */
export function estiloSitio(site) {
  const radio = Number(site?.radiusM);
  return {
    monitoring: site?.geofenceStatus === "monitoring",
    radiusM: Number.isFinite(radio) && radio > 0 ? radio : null,
  };
}

/**
 * El rectángulo que encuadra cada sitio CON su círculo.
 *
 * Encuadrar sólo los pines corta los círculos por el borde, y con un único
 * sitio dejaría el zoom al máximo, con un radio de 400 m fuera de la vista.
 */
export function limitesSitios(sites) {
  const puntos = [];
  for (const s of sitiosConPin(sites)) {
    const r = estiloSitio(s).radiusM ?? 0;
    const dLat = r / METROS_POR_GRADO;
    const dLon = r / (METROS_POR_GRADO * Math.max(Math.cos((s.lat * Math.PI) / 180), 0.01));
    puntos.push([s.lat - dLat, s.lon - dLon], [s.lat + dLat, s.lon + dLon]);
  }
  return puntos.length ? puntos : null;
}
