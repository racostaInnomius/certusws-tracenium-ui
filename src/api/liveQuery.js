// src/api/liveQuery.js
//
// ADR-0029 — consulta en vivo. REST en /api/v1/live-queries (capacidad
// `live_query`, plugin AMP).

import { httpGetJson, httpPostJson } from "./http";

const BASE = "/api/v1/live-queries";

export async function listLiveQueryProbes() {
  return httpGetJson(`${BASE}/probes`);
}

export async function listLiveQueries() {
  return httpGetJson(BASE, { cache: "no-store" });
}

/** body: { probe, params, target: { scope: "all" } | { scope: "group", groupId } | { scope: "devices", deviceIds } } */
export async function createLiveQuery(body) {
  return httpPostJson(BASE, body);
}

/** Sin caché (`no-store`): con `reload`, un fallo temporal devolvería la copia vieja en silencio y un sondeo parecería «nadie contesta». */
export async function getLiveQuery(queryId, { page = 1, pageSize = 50, status = null, key = null } = {}) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) qs.set("status", status);
  if (key) qs.set("key", key);
  return httpGetJson(`${BASE}/${encodeURIComponent(queryId)}?${qs.toString()}`, { cache: "no-store" });
}
