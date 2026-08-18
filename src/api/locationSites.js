// src/api/locationSites.js
//
// CRUD client for the CIDR → site-name map (Phase 1b of device geolocation).
// The map turns "10.20.30.0/24" into "Oficina CDMX" wherever a device location
// is shown; with no mappings the UI simply falls back to the raw subnet, so
// this surface is entirely optional for the operator.

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
