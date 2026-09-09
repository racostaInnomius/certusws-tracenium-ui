// src/api/geofences.js
//
// Geocercas (ADR-0017 fase 1). La lectura trae, por cada sitio, su
// configuración de cerca, cuántos equipos hay en cada estado y —lo que evita
// que la función parezca rota— el radio SUGERIDO a partir de la precisión
// observada en ese sitio.
//
// La escritura reutiliza el PATCH de sitios: una cerca no es una entidad
// aparte, es un sitio con radio. Duplicar un endpoint para dos columnas del
// mismo registro dejaría dos sitios donde mirar cuando algo no cuadre.

import { httpGetJson } from "./http";
import { updateLocationSite } from "./locationSites";

const BASE = "/api/v1/dashboard/geofences";

export async function listGeofences() {
  return httpGetJson(BASE, { cache: "reload" });
}

/** Enciende o apaga la cerca de un sitio, y/o fija su radio. */
export async function saveGeofence(siteId, { radiusM, geofenceStatus }) {
  const payload = {};
  if (radiusM !== undefined) payload.radiusM = radiusM;
  if (geofenceStatus !== undefined) payload.geofenceStatus = geofenceStatus;
  return updateLocationSite(siteId, payload);
}
