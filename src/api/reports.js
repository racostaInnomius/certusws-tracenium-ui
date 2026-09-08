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

/**
 * Manda por correo un run YA generado, con el fichero archivado.
 *
 * ⚠️ NO es `emailReport`. Ése GENERA uno nuevo para mandarlo, y por tanto deja
 * otra fila en el ledger con otro SHA-256: "el informe que miré" y "el que
 * mandé" acaban siendo dos documentos distintos, con datos distintos si algo
 * se movió entre medias. Esto manda el mismo cuyo hash ya está registrado.
 */
export async function emailReportRun(runId, { memberIds, externalEmails }) {
  return httpPostJson(`${BASE}/runs/${encodeURIComponent(runId)}/email`, {
    memberIds,
    externalEmails,
  });
}

export async function getReportTypes() {
  return httpGetJson(`${BASE}/types`);
}

/**
 * Una página del historial, con sus filtros.
 *
 * Los filtros los aplica el SERVIDOR: traerse 500 filas para filtrarlas aquí
 * funciona hasta el primer tenant con volumen, y entonces falla en silencio —
 * la tabla dice "no hay nada" cuando lo que pasa es que lo buscado quedó fuera
 * de lo que se trajo.
 *
 * Devuelve `{ runs, total, limit, offset }`; el total es el de LA CONSULTA, y
 * es lo que deja al paginador saber cuántas páginas hay.
 */
export async function getReportRuns({ limit, offset, key, status, trigger, actor, from, to } = {}) {
  const qs = buildParamsQuery({ limit, offset, key, status, trigger, actor, from, to }).replace(/^&/, "?");
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
  // `preview=1` le dice al backend que esto se MIRA, no que sale un fichero:
  // no escribe fila en `report_runs`. Ese ledger existe para lo que se
  // entrega —de él cuelgan la re-entrega y el SHA-256—, y una fila sin
  // fichero que re-entregar entierra a las que sí lo tienen. El evento de
  // auditoría sí se escribe: mirar el informe sigue siendo una acción con
  // actor y momento.
  return httpGetJson(
    `${BASE}/${encodeURIComponent(key)}/run?format=json&preview=1${buildParamsQuery(params)}`,
    { cache: false }
  );
}

/**
 * Genera el informe y DEVUELVE el artefacto, sin descargarlo.
 *
 * Separado de `runReport` porque generar y quedárselo son dos decisiones. El
 * catálogo pregunta qué formato, genera, y sólo entonces ofrece descargar o
 * mandar por correo: mientras el informe no existe, esos botones no tienen
 * sobre qué actuar.
 *
 * ⚠️ Genera de verdad — deja su fila en `report_runs` con su SHA-256 y el
 * nombre de quien la pidió. No es una vista previa; para mirar sin registrar
 * está `previewReport`.
 *
 * Las corridas interactivas NO se archivan en el blob (eso lo hace el barrido
 * de programaciones), así que estos bytes son la ÚNICA copia: quien los
 * quiera, que los descargue de aquí. `GET /runs/:id/download` contesta 404
 * para ellas.
 */
export async function generateReport(key, format, params) {
  const { blob, filename } = await httpGetBlob(
    `${BASE}/${encodeURIComponent(key)}/run?format=${encodeURIComponent(format)}${buildParamsQuery(params)}`
  );
  return { blob, filename: filename || `${key}.${format}` };
}

export async function runReport(key, format, params) {
  const { blob, filename } = await generateReport(key, format, params);
  saveBlob(blob, filename);
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
