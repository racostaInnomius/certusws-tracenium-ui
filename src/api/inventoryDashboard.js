import { httpGetJson } from "./http";
import { buildQuery } from "./query";


const BASE = "/api/v1/dashboard";

export async function getInactiveAssets(params = {}) {
  return httpGetJson(`${BASE}/inactive-assets${buildQuery(params)}`);
}

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

// Browser inventory — fleet posture per browser family (versions + how many
// devices are behind the newest version in the fleet). Its own top-level path,
// not under /dashboard.
export async function getBrowserInventory() {
  return httpGetJson("/api/v1/browser-inventory");
}