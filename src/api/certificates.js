import { httpGetJson, httpPostJson } from "./http";

const BASE = "/api/v1/security/certificates";

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      query.append(key, String(value));
    }
  });

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

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
