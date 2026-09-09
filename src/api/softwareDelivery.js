// src/api/softwareDelivery.js
//
// Wrapper over /api/v1/software-delivery — the actual SDP feature
// (third-party software deployment to the fleet). Distinct from
// /api/v1/agent-releases (Tracenium agent installer catalog), which
// formerly lived at this path until the 2026-05-01 rename.

import {
  httpGetJson,
  httpPostJson,
  httpPatchJson,
  httpDeleteJson,
  httpPostBinaryWithProgress,
} from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/software-delivery";


// ── Catalog (software_packages) ──────────────────────────────────

export async function listPackages(params = {}) {
  return httpGetJson(`${BASE}${buildQuery(params)}`);
}

export async function getPackage(id) {
  return httpGetJson(`${BASE}/${encodeURIComponent(id)}`);
}

export async function createPackage(payload) {
  return httpPostJson(BASE, payload);
}

export async function updatePackage(id, payload) {
  return httpPatchJson(`${BASE}/${encodeURIComponent(id)}`, payload);
}

export async function deletePackage(id) {
  return httpDeleteJson(`${BASE}/${encodeURIComponent(id)}`);
}

// ── Deployments ───────────────────────────────────────────────────

export async function deployPackage(packageId, body) {
  // Fan-out: backend resolves target, snapshots package, creates one
  // job per device. Returns 202 with the deployment + initial counts.
  return httpPostJson(
    `${BASE}/${encodeURIComponent(packageId)}/deploy`,
    body
  );
}

export async function listDeployments(params = {}) {
  return httpGetJson(`${BASE}/deployments${buildQuery(params)}`);
}

export async function getDeployment(id) {
  return httpGetJson(`${BASE}/deployments/${encodeURIComponent(id)}`);
}

export async function listDeploymentResults(id) {
  return httpGetJson(
    `${BASE}/deployments/${encodeURIComponent(id)}/results`
  );
}

export async function cancelDeployment(id) {
  return httpPostJson(
    `${BASE}/deployments/${encodeURIComponent(id)}/cancel`,
    {}
  );
}

// ── AI Intake (upload → verify → AI proposal → review) ────────────

// Upload an installer binary. The bytes are the body (octet-stream); the
// filename + operator hints ride in the query string. Returns the persisted
// intake record (verdict + proposal), 201 even when the verdict is `blocked`.
export async function uploadIntake(file, hints = {}, { onProgress } = {}) {
  const params = {
    filename: hints.filename ?? file?.name ?? "package.bin",
    name: hints.name,
    vendor: hints.vendor,
    version: hints.version,
    declaredSha256: hints.declaredSha256,
  };
  // Un MSI de empresa son cientos de MB y la subida tarda minutos. Sin avance
  // el diálogo parece colgado: el operador no puede distinguir «subiendo» de
  // «se murió», y la reacción natural es cancelar y reintentar, que empieza
  // los mismos minutos otra vez.
  return httpPostBinaryWithProgress(`${BASE}/intake${buildQuery(params)}`, file, {
    onProgress,
    // El techo del intake son 300 MiB y el analisis posterior no es
    // instantaneo: 2 minutos cortaban subidas legitimas por reloj.
    timeoutMs: 20 * 60 * 1000,
  });
}

export async function listIntakes(params = {}) {
  return httpGetJson(`${BASE}/intake${buildQuery(params)}`);
}

// ── Overview analytics ────────────────────────────────────────────
//
// Server-side aggregates. These exist because listDeployments carries an
// N+1 (one counts query per row), so charting from the list would cost
// hundreds of round trips. `window` is an "Nd" string, clamped to 90d.

export async function getDeploymentTimeseries(window = "30d") {
  return httpGetJson(`${BASE}/analytics/timeseries${buildQuery({ window })}`);
}

export async function getDownloadTierStats(window = "30d") {
  return httpGetJson(`${BASE}/analytics/tier-stats${buildQuery({ window })}`);
}

/**
 * De dónde bajaron los endpoints su PROPIO agente.
 *
 * ⚠️ Población distinta de `getDownloadTierStats`, que sólo mide software de
 * terceros. En tenant 111 esa diferencia son 9 eventos contra 397: el panel
 * llegó a decir "0% served from the LAN" mientras el DP servía casi
 * cuatrocientas descargas de agente.
 */
export async function getAgentUpdateSources(window = "30d") {
  return httpGetJson(`${BASE}/analytics/agent-update-sources${buildQuery({ window })}`);
}

// ── Distribution (Phase B) — sites + distribution points ──────────

export async function listSites() {
  return httpGetJson(`${BASE}/distribution/sites`);
}

export async function createSite(payload) {
  return httpPostJson(`${BASE}/distribution/sites`, payload);
}

export async function updateSite(id, payload) {
  return httpPatchJson(`${BASE}/distribution/sites/${encodeURIComponent(id)}`, payload);
}

export async function deleteSite(id) {
  return httpDeleteJson(`${BASE}/distribution/sites/${encodeURIComponent(id)}`);
}

export async function listDistributionPoints() {
  return httpGetJson(`${BASE}/distribution/dps`);
}

export async function upsertDistributionPoint(payload) {
  return httpPostJson(`${BASE}/distribution/dps`, payload);
}

export async function deleteDistributionPoint(id) {
  return httpDeleteJson(`${BASE}/distribution/dps/${encodeURIComponent(id)}`);
}

/**
 * Config-coherence warnings: distribution points that do not live inside every
 * subnet their own site claims. Those peers have to cross a network boundary
 * to reach the DP, which normally means a closed firewall port and an install
 * that hangs with no error at all.
 */
export async function getDistributionReachability() {
  return httpGetJson(`${BASE}/distribution/coverage`);
}

export async function getIntake(id) {
  return httpGetJson(`${BASE}/intake/${encodeURIComponent(id)}`);
}

// Approve a pending intake — creates the catalog package from the (optionally
// operator-edited) proposal and marks the intake approved. `overrides` is a
// partial CreateSoftwarePackageInput.
export async function approveIntake(id, overrides = {}) {
  return httpPostJson(`${BASE}/intake/${encodeURIComponent(id)}/approve`, overrides);
}

export async function rejectIntake(id) {
  return httpPostJson(`${BASE}/intake/${encodeURIComponent(id)}/reject`, {});
}

// ── Catálogo global visto por este tenant (ADR-0016 F2) ───────────────

/** Lo publicado por Tracenium, marcando qué tiene ya este tenant. */
export async function getGlobalCatalog() {
  return httpGetJson(`${BASE}/global-catalog`);
}

/**
 * Enlaza una entrada al catálogo del tenant.
 *
 * Es una ACEPTACIÓN, no una re-verificación: el análisis de firma e integridad
 * ocurrió una vez, al publicarse. El servidor registra quién acepta.
 */
export async function linkGlobalEntry(entryId) {
  return httpPostJson(`${BASE}/global-catalog/${encodeURIComponent(entryId)}/link`, {});
}

/**
 * Enlaza de un título las variantes que la flota necesita (F5/F6).
 *
 * Devuelve un informe, no un "ok": qué se enlazó, qué objetivos de la flota no
 * tienen nada publicado, y si hubo que suponer la arquitectura. La UI lo
 * enseña — suponer en silencio es lo que el ADR descarta.
 */
export async function linkGlobalTitle(titleKey) {
  return httpPostJson(
    `${BASE}/global-catalog/title/${encodeURIComponent(titleKey)}/link`,
    {}
  );
}
