// src/api/playbooks.js
//
// ADR-0034 — playbooks. REST en /api/v1/playbooks (capacidad `playbooks`;
// ARMAR pide además la de la acción, y eso lo decide el servidor).

import { httpDeleteJson, httpGetJson, httpPostJson, httpPutJson } from "./http";

const BASE = "/api/v1/playbooks";

export async function listPlaybooks() {
  return httpGetJson(BASE, { cache: "no-store" });
}

export async function getPlaybookLimits() {
  return httpGetJson(`${BASE}/limits`);
}

export async function createPlaybook(body) {
  return httpPostJson(BASE, body);
}

export async function updatePlaybook(id, body) {
  return httpPutJson(`${BASE}/${encodeURIComponent(id)}`, body);
}

/** mode: "armed" | "dry_run". */
export async function setPlaybookMode(id, mode) {
  return httpPostJson(`${BASE}/${encodeURIComponent(id)}/mode`, { mode });
}

export async function setPlaybookEnabled(id, enabled) {
  return httpPostJson(`${BASE}/${encodeURIComponent(id)}/enabled`, { enabled });
}

export async function deletePlaybook(id) {
  return httpDeleteJson(`${BASE}/${encodeURIComponent(id)}`);
}

export async function listPlaybookRuns(id, limit = 50) {
  return httpGetJson(`${BASE}/${encodeURIComponent(id)}/runs?limit=${encodeURIComponent(limit)}`, { cache: "no-store" });
}

/** Lo que la automatización hizo sobre UNA alerta (permiso de alertas). */
export async function listPlaybookRunsForAlert(sourceEventId) {
  return httpGetJson(`${BASE}/runs?sourceEventId=${encodeURIComponent(sourceEventId)}`, { cache: "no-store" });
}
