// src/api/reports.js
//
// Client for ADR-0008 Fase F1a's /api/v1/reports/* — the registry
// wrapping the 5 existing report generators behind one gated catalog.

import { httpGetJson, httpGetBlob, httpPostJson, httpPatchJson, httpDeleteJson } from "./http";
import { saveBlob } from "../utils/browserState";

const BASE = "/api/v1/reports";

// ── ADR-0014 E3: schedules + archived runs ──────────────────────────

export async function listReportSchedules() {
  return httpGetJson(`${BASE}/schedules`, { cache: false });
}

// { reportKey, format, params, periodMonths, recipientMemberIds, recipientExternal }
export async function createReportSchedule(input) {
  return httpPostJson(`${BASE}/schedules`, input);
}

export async function updateReportSchedule(id, patch) {
  return httpPatchJson(`${BASE}/schedules/${encodeURIComponent(id)}`, patch);
}

export async function deleteReportSchedule(id) {
  return httpDeleteJson(`${BASE}/schedules/${encodeURIComponent(id)}`);
}

export async function runReportScheduleNow(id) {
  return httpPostJson(`${BASE}/schedules/${encodeURIComponent(id)}/run`, {});
}

// ── ADR-0014 E4: GRC connector (API keys, push targets, deliveries) ──

export async function listApiKeys() {
  return httpGetJson(`${BASE}/api-keys`, { cache: false });
}

// → { key, secret }; `secret` is shown once and never retrievable again.
export async function createApiKey({ label, scopes }) {
  return httpPostJson(`${BASE}/api-keys`, { label, ...(scopes ? { scopes } : {}) });
}

export async function revokeApiKey(id) {
  return httpDeleteJson(`${BASE}/api-keys/${encodeURIComponent(id)}`);
}

export async function listGrcTargets() {
  return httpGetJson(`${BASE}/grc/targets`, { cache: false });
}

// { kind: "webhook"|"vanta", label, config: {...}, secret }
export async function createGrcTarget(input) {
  return httpPostJson(`${BASE}/grc/targets`, input);
}

export async function updateGrcTarget(id, patch) {
  return httpPatchJson(`${BASE}/grc/targets/${encodeURIComponent(id)}`, patch);
}

export async function deleteGrcTarget(id) {
  return httpDeleteJson(`${BASE}/grc/targets/${encodeURIComponent(id)}`);
}

export async function testGrcTarget(id) {
  return httpPostJson(`${BASE}/grc/targets/${encodeURIComponent(id)}/test`, {});
}

export async function deliverRunToGrcTarget(id, runId) {
  return httpPostJson(`${BASE}/grc/targets/${encodeURIComponent(id)}/deliver`, { runId });
}

export async function listGrcDeliveries({ targetId, runId, limit } = {}) {
  const qs = [targetId && `targetId=${encodeURIComponent(targetId)}`, runId && `runId=${encodeURIComponent(runId)}`, limit && `limit=${encodeURIComponent(limit)}`]
    .filter(Boolean)
    .join("&");
  return httpGetJson(`${BASE}/grc/deliveries${qs ? `?${qs}` : ""}`, { cache: false });
}

// Archived copy of a past run (the exact bytes whose SHA-256 the ledger
// records). Same blob path as runReport: the tenant header must travel.
export async function downloadReportRun(run) {
  const { blob, filename } = await httpGetBlob(`${BASE}/runs/${encodeURIComponent(run.id)}/download`);
  saveBlob(blob, filename || run.filename || `${run.key}.${run.format}`);
}

export async function getReportTypes() {
  return httpGetJson(`${BASE}/types`);
}

export async function getReportRuns({ limit } = {}) {
  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  // ⚠️ `cache: false` como el resto del módulo. Era la única llamada sin él,
  // y el efecto se veía: tras "Run now" la página recargaba el historial y
  // recibía la entrada cacheada de hasta 60 s antes, así que el run recién
  // lanzado no aparecía y el usuario volvía a pulsar.
  return httpGetJson(`${BASE}/runs${qs}`, { cache: false });
}

// Every format — including json (CBOM) — goes through httpGetBlob +
// saveBlob, never a raw <a href>: an anchor navigation can't carry the
// X-Tenant-Id header an MSP operator's drilled-in session needs, so the
// export would silently reflect the wrong tenant (the exact incident
// ADR-0008 documents for the compliance PDF export). Same pattern as
// src/api/compliance.js's downloadFindingsCsv/Pdf.
export function buildParamsQuery(params) {
  const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("");
}

/**
 * Vista previa: el MISMO endpoint del motor, leído como JSON en vez de
 * guardado como fichero.
 *
 * `runReport` baja un blob y lo guarda; una vista previa necesita el objeto
 * para pintarlo. Es la única diferencia — la ruta, el gate por tipo y el
 * registro en `report_runs` son idénticos, así que no hay una segunda puerta
 * que mantener ni que se olvide de un permiso.
 *
 * `cache: false` porque una previsualización que enseñe una foto de hace un
 * minuto contradice al panel que el operador acaba de mirar.
 */
export async function previewReport(key, params) {
  return httpGetJson(
    `${BASE}/${encodeURIComponent(key)}/run?format=json${buildParamsQuery(params)}`,
    { cache: false }
  );
}

export async function runReport(key, format, params) {
  const { blob, filename } = await httpGetBlob(
    `${BASE}/${encodeURIComponent(key)}/run?format=${encodeURIComponent(format)}${buildParamsQuery(params)}`
  );
  saveBlob(blob, filename || `${key}.${format}`);
}

// { sent: string[], failed: {email, sent, reason}[] }
export async function emailReport(key, { format, memberIds, externalEmails, params }) {
  return httpPostJson(`${BASE}/${encodeURIComponent(key)}/email`, {
    format,
    memberIds,
    externalEmails,
    ...(params && Object.keys(params).length ? { params } : {})
  });
}
