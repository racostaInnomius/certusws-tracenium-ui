import { httpGetJson } from "./http";

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

const BASE = "/api/v1/dashboard";

export async function getHardwareInventorySummary() {
  return httpGetJson(`${BASE}/hardware-inventory/summary`);
}

export async function getHardwareInventoryRankings() {
  return httpGetJson(`${BASE}/hardware-inventory/rankings`);
}

export async function getHardwareInventoryDetail(params = {}) {
  return httpGetJson(
    `${BASE}/hardware-inventory/detail${buildQuery(params)}`
  );
}

export async function getSoftwareInventorySummary() {
  return httpGetJson(`${BASE}/software-inventory/summary`);
}

export async function getSoftwareInventoryRankings() {
  return httpGetJson(`${BASE}/software-inventory/rankings`);
}

export async function getSoftwareInventoryDetail(params = {}) {
  return httpGetJson(
    `${BASE}/software-inventory/detail${buildQuery(params)}`
  );
}

export async function getSoftwareInventoryHosts(params = {}) {
  return httpGetJson(`${BASE}/software-inventory/hosts${buildQuery(params)}`);
}

export async function getSoftwareInventoryHostApps(agentId, params = {}) {
  return httpGetJson(
    `${BASE}/software-inventory/hosts/${encodeURIComponent(agentId)}/apps${buildQuery(params)}`
  );
}