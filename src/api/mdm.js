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

// ── Actualización de macOS forzada (DDM) ────────────────────────────────────
// Programar o cancelar piden además ADMIN/OWNER: a la hora indicada el Mac
// instala y reinicia.

const osUpdatePath = (udid) => `/api/v1/mdm/devices/${encodeURIComponent(udid)}/os-update`;

/** → { scheduled: {targetOSVersion, targetBuildVersion, targetLocalDateTime, requestedAt} | null, device: {...} | null } */
export function getMdmOsUpdate(udid, { fresh = false } = {}) {
  return httpGetJson(osUpdatePath(udid), opts(fresh));
}

/** { targetOSVersion, targetBuildVersion?, targetLocalDateTime: "yyyy-mm-ddThh:mm:ss" (hora local del Mac) } */
export function scheduleMdmOsUpdate(udid, body) {
  return httpPutJson(osUpdatePath(udid), body);
}

export function cancelMdmOsUpdate(udid) {
  return httpDeleteJson(osUpdatePath(udid));
}

// ── Perfil de la organización en un Mac (1-oct) ─────────────────────────────
// Los Macs del MDM de Tracenium lo reciben solos en cada conexión. «Resend»
// (ADMIN/OWNER) olvida lo entregado: la próxima conexión lo vuelve a encolar.

const orgProfilePath = (udid) => `/api/v1/mdm/devices/${encodeURIComponent(udid)}/organization-profile`;

/** → { delivery: { requestType, settingsCount, status, errorChain, enqueuedAt, completedAt } | null } */
export function getMdmOrganizationProfile(udid, { fresh = false } = {}) {
  return httpGetJson(orgProfilePath(udid), opts(fresh));
}

export function resendMdmOrganizationProfile(udid) {
  return httpPostJson(`${orgProfilePath(udid)}/resend`, {});
}

/**
 * «Ask to check in» (2-oct): pide el aviso de Apple push para este equipo.
 * → { requested, canDeliver, blocker: null | "certificate_missing" | "topic_mismatch" | "no_push_token" }
 */
export function wakeMdmDevice(udid) {
  return httpPostJson(`/api/v1/mdm/devices/${encodeURIComponent(udid)}/wake`, {});
}

// ── DDM de un equipo (1-oct): sus declaraciones —y si el Mac las tiene
// aplicadas— y el inventario que informa sin agente. Sólo lectura.

/** → { reportedAt, declarations: [{identifier, purpose, state, reasons, ...}], inventory: {...} | null } */
export function getMdmDeclarative(udid, { fresh = false } = {}) {
  return httpGetJson(`/api/v1/mdm/devices/${encodeURIComponent(udid)}/ddm`, opts(fresh));
}
