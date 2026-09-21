// src/api/siem.js
//
// ADR-0028 — destinos SIEM de las alertas. REST en /api/v1/siem (capacidad
// `alerts`). El secreto se envía al crear o rotar y nunca vuelve.

import { httpDeleteJson, httpGetJson, httpPostJson, httpPutJson } from "./http";

const BASE = "/api/v1/siem/destinations";

export async function listSiemDestinations() {
  return httpGetJson(BASE, { cache: "reload" });
}

export async function createSiemDestination(body) {
  return httpPostJson(BASE, body);
}

export async function updateSiemDestination(id, body) {
  return httpPutJson(`${BASE}/${encodeURIComponent(id)}`, body);
}

export async function deleteSiemDestination(id) {
  return httpDeleteJson(`${BASE}/${encodeURIComponent(id)}`);
}

/** Un evento de prueba. No mueve el cursor: no consume ni reenvía alertas reales. */
export async function testSiemDestination(id) {
  return httpPostJson(`${BASE}/${encodeURIComponent(id)}/test`, {});
}
