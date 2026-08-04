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

export async function createLocationSite({ cidr, siteName, description }) {
  return httpPostJson(BASE, { cidr, siteName, description });
}

export async function updateLocationSite(id, patch) {
  return httpPatchJson(`${BASE}/${encodeURIComponent(id)}`, patch);
}

export async function deleteLocationSite(id) {
  return httpDeleteJson(`${BASE}/${encodeURIComponent(id)}`);
}
