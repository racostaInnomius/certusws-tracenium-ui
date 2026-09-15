// src/api/adPrinters.js
//
// ADR-0023 — el colector de impresoras publicadas en Active Directory.
// REST en /api/v1/ad-printers (ADMIN/OWNER, como Agent Settings).

import { httpDeleteJson, httpGetJson, httpPostJson, httpPutJson } from "./http";

const BASE = "/api/v1/ad-printers";

/** Colector elegido, últimas corridas y colas por dominio. */
export async function getAdPrintersStatus() {
  return httpGetJson(BASE, { cache: "reload" });
}

/** Equipos Windows de la flota, con versión de agente y si están online. */
export async function listAdPrinterCandidates() {
  return httpGetJson(`${BASE}/candidates`, { cache: "reload" });
}

export async function setAdPrinterCollector({ primaryDeviceId, secondaryDeviceId = null }) {
  return httpPutJson(`${BASE}/collector`, { primaryDeviceId, secondaryDeviceId });
}

export async function clearAdPrinterCollector() {
  return httpDeleteJson(`${BASE}/collector`);
}

/** «Run now». 409 con código si no hay colector online, el agente es viejo o ya hay una en curso. */
export async function runAdPrintersNow() {
  return httpPostJson(`${BASE}/run`, {});
}
