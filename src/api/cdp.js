// src/api/cdp.js
//
// CDP (Crypto Discovery Plugin) — certificates discovered ON devices by
// the cdp agent plugin. NOT the same API as certificates.js
// (/api/v1/security/certificates), which covers the agent's own
// mTLS/PKI identity certs.

import { httpGetJson, httpPostJson } from "./http";
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
