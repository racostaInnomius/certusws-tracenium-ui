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
  return httpGetJson(`${BASE}/${encodeURIComponent(tenantId)}`);
}

export async function getTenantSummary(tenantId) {
  return httpGetJson(`${BASE}/${encodeURIComponent(tenantId)}/summary`);
}

export async function updateTenant(tenantId, payload) {
  return httpPutJson(`${BASE}/${encodeURIComponent(tenantId)}`, payload);
}

export async function deleteTenant(tenantId) {
  return httpDeleteJson(`${BASE}/${encodeURIComponent(tenantId)}`);
}

export async function listTenantMembers(tenantId) {
  return httpGetJson(`${BASE}/${encodeURIComponent(tenantId)}/members`);
}

export async function createTenantMember(tenantId, payload) {
  return httpPostJson(`${BASE}/${encodeURIComponent(tenantId)}/members`, payload);
}

export async function updateTenantMember(tenantId, memberId, payload) {
  return httpPutJson(
    `${BASE}/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(memberId)}`,
    payload
  );
}

export async function deleteTenantMember(tenantId, memberId) {
  return httpDeleteJson(
    `${BASE}/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(memberId)}`
  );
}

export async function cancelPendingInvite(tenantId, inviteId) {
  return httpDeleteJson(
    `${BASE}/${encodeURIComponent(tenantId)}/pending-invites/${encodeURIComponent(inviteId)}`
  );
}