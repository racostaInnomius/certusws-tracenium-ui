// src/api/mdm.js
//
// Enrolamiento MDM de Apple y equipos enrolados (certusws-tracenium,
// modules/mdm/mdm-admin.routes.ts). Montado con la capacidad `enrollment`.
//
// `fresh`: tras crear o revocar un alta, la lista tiene que salir de la red y
// no de la caché de 60 s de httpGetJson.

import { httpDeleteJson, httpGetJson, httpPostJson, httpPutJson } from "./http";

const opts = (fresh) => (fresh ? { cache: "reload" } : {});

export function getMdmStatus({ fresh = false } = {}) {
  return httpGetJson("/api/v1/mdm/status", opts(fresh));
}

export function listMdmDevices({ fresh = false } = {}) {
  return httpGetJson("/api/v1/mdm/devices", opts(fresh));
}

export function listMdmEnrollments({ fresh = false } = {}) {
  return httpGetJson("/api/v1/mdm/enrollments?limit=100", opts(fresh));
}

/** { clientIdentifier, mode: "corporate"|"byod", expiresInHours?, displayName? } */
export function createMdmEnrollment(payload) {
  return httpPostJson("/api/v1/mdm/enrollments", payload);
}

export function revokeMdmEnrollment(token) {
  return httpDeleteJson(`/api/v1/mdm/enrollments/${encodeURIComponent(token)}`);
}

// ── Apple setup: certificado de push de la organización ────────────────────
// Pedir la solicitud y subir el `.pem` piden además ADMIN/OWNER.

export function getMdmPushCertificate({ fresh = false } = {}) {
  return httpGetJson("/api/v1/mdm/push-certificate", opts(fresh));
}

/** → { filename, content (base64, tal cual va a Apple), requestedAt, portalUrl } */
export function requestMdmPushCertificate() {
  return httpPostJson("/api/v1/mdm/push-certificate/request", {});
}

/** { certificate (texto del .pem), appleAccount, confirmTopicChange? } */
export function installMdmPushCertificate(payload) {
  return httpPutJson("/api/v1/mdm/push-certificate", payload);
}
