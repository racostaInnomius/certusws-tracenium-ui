import { httpGetJson, httpPostJson } from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/security/certificates";


export async function getCertificateSummary() {
  return httpGetJson(`${BASE}/summary`);
}

export async function listExpiringCertificates(params = {}) {
  return httpGetJson(`${BASE}/expiring${buildQuery(params)}`);
}

export async function listCertificateDevices(params = {}) {
  return httpGetJson(`${BASE}/devices${buildQuery(params)}`);
}

export async function listDevicesWithoutActiveCertificates(params = {}) {
  return httpGetJson(`${BASE}/devices/without-active${buildQuery(params)}`);
}

export async function listDeviceCertificates(deviceId) {
  return httpGetJson(`${BASE}/devices/${encodeURIComponent(deviceId)}`);
}

export async function getCertificateDetail(fingerprint) {
  return httpGetJson(`${BASE}/${encodeURIComponent(fingerprint)}`);
}

export async function getCertificateActivity(fingerprint, params = {}) {
  return httpGetJson(`${BASE}/${encodeURIComponent(fingerprint)}/activity${buildQuery(params)}`);
}

export async function revokeCertificate(fingerprint, body = {}) {
  return httpPostJson(`${BASE}/${encodeURIComponent(fingerprint)}/revoke`, body);
}

/**
 * Pide al equipo que REEMITA su identidad mTLS (ADR-0015).
 *
 * ⚠️ NO cuelga de `/security/certificates` como el resto de este fichero:
 * la ruta es `/api/v1/devices/:id/cert/rotate` porque la acción es sobre
 * el EQUIPO, no sobre un certificado. Ese matiz importa — el certificado
 * nuevo aún no existe cuando se pide, así que no hay huella que nombrar.
 *
 * El cuerpo lleva expediente OBLIGATORIO (`reason` + `ticketRef`): es una
 * acción privilegiada sobre el endpoint bajo el régimen de ADR-0009.
 * `breakGlass: true` sólo lo puede ejercer un OWNER y queda marcado para
 * siempre en el expediente.
 *
 * ⚠️ Devuelve 202 en DOS casos distintos y hay que separarlos:
 *   { ok: true,  status: "dispatched",       jobId }
 *   { ok: false, status: "pending_approval", requestId, expiresAt }
 * El segundo NO es un fallo: es el gate haciendo su trabajo. Tratarlo
 * como error enseñaría un rojo por una petición que salió bien.
 */
export async function requestCertificateRotation(deviceId, body = {}) {
  return httpPostJson(`/api/v1/devices/${encodeURIComponent(deviceId)}/cert/rotate`, body);
}
