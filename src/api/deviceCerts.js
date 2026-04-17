import { httpGetJson, httpPostJson } from "./http";

const BASE = "/api/v1/device-certs";

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

export async function listDeviceCertDevices(params = {}) {
  return httpGetJson(`${BASE}/devices${buildQuery(params)}`);
}

export async function listDeviceCerts(deviceId) {
  return httpGetJson(`${BASE}/${encodeURIComponent(deviceId)}/certs`);
}

export async function revokeDeviceCert(deviceId, fingerprint, reason) {
  return httpPostJson(
    `${BASE}/${encodeURIComponent(deviceId)}/certs/${encodeURIComponent(
      fingerprint
    )}/revoke`,
    {
      reason: String(reason || "").trim(),
    }
  );
}

export async function revokeBulkDeviceCerts(deviceId, fingerprints, reason) {
  return httpPostJson(
    `${BASE}/${encodeURIComponent(deviceId)}/certs/revoke-bulk`,
    {
      fingerprints,
      reason: String(reason || "").trim(),
    }
  );
}