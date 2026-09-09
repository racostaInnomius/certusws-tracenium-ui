// src/api/locationSites.js
//
// CRUD client de los SITIOS del tenant. Un sitio es un LUGAR con N redes, y
// convierte "10.20.30.0/24" en "Oficina CDMX" allí donde se muestra la
// ubicación de un equipo; sin sitios la UI cae a la subred cruda, así que esta
// superficie es del todo opcional para el operador.
//
// ⚠️ Un sitio dejó de ser UNA red en 20260909_sites_not_ranges: `ranges` viaja
// como la lista COMPLETA de redes del sitio y sustituye a las anteriores.

import { httpGetJson, httpPostJson, httpPatchJson, httpDeleteJson } from "./http";

const BASE = "/api/v1/dashboard/location-sites";

export async function listLocationSites() {
  return httpGetJson(BASE, { cache: "reload" });
}

// ⚠️ Forwards the whole payload rather than destructuring a fixed list of
// fields. The previous version named cidr/siteName/description explicitly and
// silently dropped everything else — so when city, lat and lon were added to
// the form and to the backend validator, they would have been discarded right
// here, and an operator filling in coordinates would have watched them vanish
// with no error. Same shape of bug as the AMP wire allowlist.
export async function createLocationSite(site) {
  return httpPostJson(BASE, site);
}

export async function updateLocationSite(id, patch) {
  return httpPatchJson(`${BASE}/${encodeURIComponent(id)}`, patch);
}

export async function deleteLocationSite(id) {
  return httpDeleteJson(`${BASE}/${encodeURIComponent(id)}`);
}
