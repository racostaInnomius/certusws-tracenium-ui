import {
  httpGetJson,
  httpPostJson,
  httpPutJson,
  httpDeleteJson,
} from "./http";

const BASE = "/api/v1/tenants";

export async function listTenantRoles(tenantId) {
  return httpGetJson(`${BASE}/${encodeURIComponent(tenantId)}/roles`);
}

export async function listCapabilities(tenantId) {
  return httpGetJson(`${BASE}/${encodeURIComponent(tenantId)}/roles/capabilities`);
}

export async function createTenantRole(tenantId, payload) {
  return httpPostJson(`${BASE}/${encodeURIComponent(tenantId)}/roles`, payload);
}

export async function updateTenantRole(tenantId, roleId, payload) {
  return httpPutJson(
    `${BASE}/${encodeURIComponent(tenantId)}/roles/${encodeURIComponent(roleId)}`,
    payload
  );
}

export async function deleteTenantRole(tenantId, roleId) {
  return httpDeleteJson(
    `${BASE}/${encodeURIComponent(tenantId)}/roles/${encodeURIComponent(roleId)}`
  );
}
