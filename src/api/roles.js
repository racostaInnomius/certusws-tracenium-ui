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

// Unlike listTenantRoles/listCapabilities (OWNER/ADMIN-only — they expose
// the whole role catalog), this is open to any active member: it returns
// only the caller's own resolved role + effective permission keys, e.g.
// { role: "IT Support", permissions: ["jobs", "alerts"] }. Pages use this
// to decide whether to render their content for a custom role, instead of
// hardcoding a check against the built-in role names.
export async function getMyCapabilities(tenantId) {
  return httpGetJson(`${BASE}/${encodeURIComponent(tenantId)}/roles/me/capabilities`);
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
