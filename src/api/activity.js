// src/api/activity.js
//
// ADR-0031 — actividad de un equipo: lo que Tracenium le envió y lo que el
// agente observó en él. REST en /api/v1/activity (capacidad `assets_view`).

import { httpGetJson } from "./http";
import { buildQuery } from "./query";

/**
 * @param {string} agentId
 * @param {{ from?: string, to?: string, lane?: string, limit?: number }} params
 *        `from`/`to` en ISO. El backend rechaza un rango invertido con
 *        INVALID_RANGE en vez de devolver una lista vacía.
 */
export async function getDeviceActivity(agentId, params = {}) {
  // buildQuery ya devuelve la interrogación (o cadena vacía).
  return httpGetJson(`/api/v1/activity/devices/${encodeURIComponent(agentId)}${buildQuery(params)}`, {
    cache: "no-store",
  });
}
