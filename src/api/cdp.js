// src/api/cdp.js
//
// CDP (Crypto Discovery Plugin) — certificates discovered ON devices by
// the cdp agent plugin. NOT the same API as certificates.js
// (/api/v1/security/certificates), which covers the agent's own
// mTLS/PKI identity certs.

import { httpGetJson, httpGetBlob, httpPostJson, httpPutJson } from "./http";
import { saveBlob } from "../utils/browserState";
import { buildQuery } from "./query";

const BASE = "/api/v1/cdp";

export async function getCdpSummary() {
  return httpGetJson(`${BASE}/summary`);
}

// Aggregate panels for the Dashboard tab (expiry horizon, hygiene
// breakdown, issuers, distribution, worklist) in one round trip.
export async function getCdpDashboard() {
  return httpGetJson(`${BASE}/dashboard`);
}

// Post-quantum readiness: the "valid beyond 2030/2035" metric plus the
// crypto-agility blockers (ADR-0004 e-F1/e-F2).
export async function getCdpPqcReadiness() {
  return httpGetJson(`${BASE}/pqc`);
}

// ── Fase 1 del análisis de madurez: exploración ──────────────────────
//
// Las agregaciones que eran triviales en SQL y no existían en la API.
// Todas de solo lectura y todas aceptan el mismo filtro de exploración
// (source, scope, storeName, agentId, keyAlgorithm, keySizeBits, family,
// hasPrivateKey, eku, includeRoots).

/** El embudo de la portada: total → tuyos → accionables → bloqueados. */
export async function getCdpExposure() {
  return httpGetJson(`${BASE}/exposure`);
}

/**
 * `by` es una lista de dimensiones (key_algorithm, key_size_bits,
 * ownership, source, store_scope, store_name, key_family, issuer_cn,
 * platform); `stack` una dimensión más para apilar.
 */
export async function getCdpFacets({ by, stack, ...filter } = {}) {
  return httpGetJson(`${BASE}/facets${buildQuery({ by: Array.isArray(by) ? by.join(",") : by, stack, ...filter })}`);
}

export async function getCdpStores(filter = {}) {
  return httpGetJson(`${BASE}/stores${buildQuery(filter)}`);
}

export async function getCdpTimeline(filter = {}) {
  return httpGetJson(`${BASE}/timeline${buildQuery(filter)}`);
}

// ── Fase 3: hoja de ruta PQC ─────────────────────────────────────────

/** Sistemas derivados con prioridad, ola sugerida, plan y recomendaciones. */
export async function getCdpRoadmap() {
  return httpGetJson(`${BASE}/roadmap`);
}

export async function getCdpRoadmapSystem(key) {
  return httpGetJson(`${BASE}/roadmap/systems/${encodeURIComponent(key)}`);
}

export async function putCdpRoadmapPlan(key, plan) {
  return httpPutJson(`${BASE}/roadmap/systems/${encodeURIComponent(key)}/plan`, plan);
}

export async function getCdpReadinessHistory(days = 180) {
  return httpGetJson(`${BASE}/readiness/history${buildQuery({ days })}`);
}

export async function postCdpReadinessSnapshot() {
  return httpPostJson(`${BASE}/readiness/snapshot`, {});
}

/**
 * Export CSV de la lista con el MISMO filtro que se está viendo. Va por
 * `httpGetBlob` y no por un `<a href>`: la cabecera X-Tenant-Id no
 * sobrevive a un enlace plano, y sin ella el backend no sabe de qué
 * tenant exportar.
 */
export async function exportCdpCertificatesCsv(params = {}) {
  const { blob, filename } = await httpGetBlob(`${BASE}/certificates/export.csv${buildQuery(params)}`);
  saveBlob(blob, filename || "cdp-certificates.csv");
}

// ── Fase 4: activos que no vienen de un agente (CBOM importado) ─────

/** Importa un CycloneDX ya parseado. `sourceName` identifica al productor. */
export async function importCdpCbom(sourceName, bom) {
  return httpPostJson(`${BASE}/cbom/import`, { sourceName, bom });
}

export async function getCryptoAssetsSummary() {
  return httpGetJson(`${BASE}/assets/summary`);
}

export async function listCryptoAssets(params = {}) {
  return httpGetJson(`${BASE}/assets${buildQuery(params)}`);
}

export async function listCdpCertificates(params = {}) {
  return httpGetJson(`${BASE}/certificates${buildQuery(params)}`);
}

export async function getCdpCertificateDetail(fingerprint) {
  return httpGetJson(`${BASE}/certificates/${encodeURIComponent(fingerprint)}`);
}

export async function listCdpDevices(params = {}) {
  return httpGetJson(`${BASE}/devices${buildQuery(params)}`);
}

export async function listCdpDeviceCertificates(agentId, params = {}) {
  return httpGetJson(
    `${BASE}/devices/${encodeURIComponent(agentId)}/certificates${buildQuery(params)}`
  );
}

export async function listCdpExpiring(params = {}) {
  return httpGetJson(`${BASE}/expiring${buildQuery(params)}`);
}

// Anclas de confianza: las CAs en las que los equipos CREEN. Solo
// lectura — la remediación es una capacidad aparte (ADR-0011 dec. 10).
export async function listCdpTrustAnchors() {
  return httpGetJson(`${BASE}/trust-anchors`);
}

/**
 * Quitar la confianza a un ancla en un equipo. ADR-0011 decisión 10.
 *
 * Puede responder 202 con `status: "pending_approval"` si la política
 * del tenant exige visto bueno — NO es un error.
 */
export async function distrustAnchor({ deviceId, thumbprint, reason, ticketRef }) {
  return httpPostJson(`${BASE}/trust-anchors/distrust`, {
    deviceId,
    thumbprint,
    reason,
    ticketRef
  });
}

// ─────────────────────────────────────────────────────────────────────
// ADR-0011 fase 3 — emisión e instalación de certificados de HOJA
// ─────────────────────────────────────────────────────────────────────
//
// Dos pasos, y son dos porque en medio está la CA del cliente. Nosotros
// no firmamos: el equipo genera la clave y su CSR, alguien lo lleva a su
// CA —ADCS, ACME, la que ya sea ancla en ese equipo— y vuelve con el
// certificado. Ver la cabecera de `cert-install.service.ts` en el
// backend para por qué el alcance es ese.
//
// Las dos pueden responder 202 con `status: "pending_approval"` si la
// política del tenant exige visto bueno. Eso NO es un error.

/**
 * Paso 1 — crear la clave EN EL EQUIPO y pedirle su CSR.
 *
 * La clave privada no viaja: nace en el llavero (macOS), en el KSP
 * (Windows) o en un fichero restringido (Linux), y lo único que sale es
 * la petición de firma. El `keyId` que devuelve es lo que hay que
 * guardar: sin él no se puede instalar después el certificado firmado.
 */
export async function generateCdpCsr({
  deviceId, subject, dnsNames, uris, eku, reason, ticketRef
}) {
  return httpPostJson(`${BASE}/certificates/csr`, {
    deviceId,
    subject,
    dnsNames,
    uris,
    eku,
    reason,
    ticketRef
  });
}

/**
 * Paso 2 — instalar el certificado ya firmado.
 *
 * Puede responder 202 con `status: "held_for_window"`: fuera de la
 * ventana de mantenimiento del tenant NO se crea el job. Tampoco es un
 * error — instalar un certificado obliga a recargar el servicio que lo
 * usa, así que se espera o se marca `ignoreWindow`.
 */
export async function installCdpCert({
  deviceId, keyId, certPem, chainPems, destination, reason, ticketRef, ignoreWindow
}) {
  return httpPostJson(`${BASE}/certificates/install`, {
    deviceId,
    keyId,
    certPem,
    chainPems,
    destination,
    reason,
    ticketRef,
    ignoreWindow
  });
}

/**
 * ADR-0011 decisión 9.d — claves huérfanas.
 *
 * Una clave privada creada para un CSR a la que nunca llegó su
 * certificado: utilidad cero y responsabilidad no-cero. La decisión
 * exige que sean un ítem del inventario y no un barrido que nadie mira,
 * porque en este producto ya hubo un `purge_after` que se escribía y no
 * barría nadie.
 */
export async function listOrphanKeys() {
  return httpGetJson(`${BASE}/keys/orphans`);
}

/** Pide a un equipo que reporte su almacén. Lectura: sin expediente. */
export async function refreshEndpointKeys(deviceId) {
  return httpPostJson(`${BASE}/keys/refresh`, { deviceId });
}

/**
 * Destruye una clave huérfana en el equipo.
 *
 * ⚠️ Lleva expediente: es irreversible y no hay «deshacer». Si el
 * certificado llegó entre la lista y esta llamada, se pierde uno ya
 * emitido.
 */
export async function destroyEndpointKey({ deviceId, keyId, reason, ticketRef }) {
  return httpPostJson(`${BASE}/keys/destroy`, { deviceId, keyId, reason, ticketRef });
}
