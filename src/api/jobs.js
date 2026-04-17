import { httpGetJson, httpPostJson } from "./http";

const BASE = "/api/v1/orchestrator";

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

export async function listConnectedDevices() {
  return httpGetJson(`${BASE}/devices-connected`);
}

export async function listDeviceJobs(deviceId, params = {}) {
  return httpGetJson(
    `${BASE}/devices/${encodeURIComponent(deviceId)}/jobs${buildQuery(params)}`
  );
}

export async function createDeviceJob(deviceId, payload) {
  return httpPostJson(
    `${BASE}/devices/${encodeURIComponent(deviceId)}/jobs`,
    payload
  );
}

export async function createTenantJobs(tenantId, payload) {
  return httpPostJson(
    `${BASE}/tenants/${encodeURIComponent(tenantId)}/jobs`,
    payload
  );
}
