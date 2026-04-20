import { httpDeleteJson, httpGetJson, httpPostJson, httpPutJson } from "./http";

const BASE = "/api/v1/policies";

export async function getTenantPolicy(tenantId) {
  return httpGetJson(`${BASE}/tenants/${encodeURIComponent(tenantId)}/policy`);
}

export async function saveTenantPolicy(tenantId, policy) {
  return httpPutJson(`${BASE}/tenants/${encodeURIComponent(tenantId)}/policy`, policy);
}

export async function pushTenantPolicy(tenantId) {
  return httpPostJson(`${BASE}/tenants/${encodeURIComponent(tenantId)}/policy/push`, {});
}

export async function listTenantPolicyStatus(tenantId) {
  return httpGetJson(`${BASE}/tenants/${encodeURIComponent(tenantId)}/policy-status`);
}

export async function getDevicePolicy(deviceId) {
  return httpGetJson(`${BASE}/devices/${encodeURIComponent(deviceId)}/policy`);
}

export async function saveDevicePolicy(deviceId, policy) {
  return httpPutJson(`${BASE}/devices/${encodeURIComponent(deviceId)}/policy`, policy);
}

export async function deleteDevicePolicy(deviceId) {
  return httpDeleteJson(`${BASE}/devices/${encodeURIComponent(deviceId)}/policy`);
}

export async function pushDevicePolicy(deviceId) {
  return httpPostJson(`${BASE}/devices/${encodeURIComponent(deviceId)}/policy/push`, {});
}

export async function getEffectivePolicy(deviceId) {
  return httpGetJson(`${BASE}/devices/${encodeURIComponent(deviceId)}/effective-policy`);
}

export async function getDevicePolicyStatus(deviceId) {
  return httpGetJson(`${BASE}/devices/${encodeURIComponent(deviceId)}/policy-status`);
}
