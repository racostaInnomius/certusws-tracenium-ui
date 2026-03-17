import {
  httpGetJson,
  httpPostJson,
  httpPutJson,
  httpDeleteJson,
} from "./http";

const BASE = "/api/v1/tenants";

export async function listTenants() {
  return httpGetJson(BASE);
}

export async function getTenantById(tenantId) {
  return httpGetJson(`${BASE}/${tenantId}`);
}

export async function getTenantSummary(tenantId) {
  return httpGetJson(`${BASE}/${tenantId}/summary`);
}

export async function createTenant(payload) {
  return httpPostJson(BASE, payload);
}

export async function updateTenant(tenantId, payload) {
  return httpPutJson(`${BASE}/${tenantId}`, payload);
}

export async function deleteTenant(tenantId) {
  return httpDeleteJson(`${BASE}/${tenantId}`);
}

export async function listTenantMembers(tenantId) {
  return httpGetJson(`${BASE}/${tenantId}/members`);
}

export async function createTenantMember(tenantId, payload) {
  return httpPostJson(`${BASE}/${tenantId}/members`, payload);
}

export async function updateTenantMember(tenantId, memberId, payload) {
  return httpPutJson(`${BASE}/${tenantId}/members/${memberId}`, payload);
}

export async function deleteTenantMember(tenantId, memberId) {
  return httpDeleteJson(`${BASE}/${tenantId}/members/${memberId}`);
}