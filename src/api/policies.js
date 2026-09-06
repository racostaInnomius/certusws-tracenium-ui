import { httpDeleteJson, httpGetJson, httpPatchJson, httpPostJson, httpPutJson } from "./http";

const BASE = "/api/v1/policies";

// Optional opt-locking helper. When the caller passes `expectedVersion`
// we add the standard `If-Match` header — backend (Phase 2.B) compares
// it against the stored `policy_version` and returns 409 STALE_POLICY
// if someone else wrote in between. Calling without it preserves the
// legacy "last writer wins" behavior, so this is a strict superset.
function buildPutHeaders(opts) {
  const headers = {};
  const v = opts?.expectedVersion;
  if (v !== undefined && v !== null && v !== "") headers["If-Match"] = String(v);
  // `If-None-Match: *` — create only if no row exists yet. The lock of a
  // device's FIRST override, which has no version to send as If-Match and
  // still must not overwrite one created between load and save.
  if (opts?.expectAbsent) headers["If-None-Match"] = "*";
  return Object.keys(headers).length ? { headers } : undefined;
}

export async function getTenantPolicy(tenantId) {
  return httpGetJson(`${BASE}/tenants/${encodeURIComponent(tenantId)}/policy`);
}

export async function saveTenantPolicy(tenantId, policy, opts) {
  return httpPutJson(
    `${BASE}/tenants/${encodeURIComponent(tenantId)}/policy`,
    policy,
    buildPutHeaders(opts)
  );
}

// Domain-scoped save. `domain` ∈ agent-config | security | device-management;
// `slice` is the COMPLETE set of top-level keys the domain owns (a
// whitelisted key omitted from the slice is REMOVED from the stored
// policy — replace-slice semantics). The server preserves every key
// outside the domain verbatim, which is what lets the three authoring
// pages coexist without clobbering each other.
export async function patchTenantPolicyDomain(tenantId, domain, slice, opts) {
  return httpPatchJson(
    `${BASE}/tenants/${encodeURIComponent(tenantId)}/policy/domains/${encodeURIComponent(domain)}`,
    slice,
    buildPutHeaders(opts)
  );
}

export async function pushTenantPolicy(tenantId) {
  return httpPostJson(`${BASE}/tenants/${encodeURIComponent(tenantId)}/policy/push`, {});
}

// Devices running a policy patch of their own, with the paths each one
// fixes (`overridden_paths`). Source: the override table, not the rollout
// status (which follows one heartbeat behind).
export async function listTenantOverrides(tenantId) {
  return httpGetJson(`${BASE}/tenants/${encodeURIComponent(tenantId)}/policy/overrides`);
}

// Removes EVERY override of the tenant and reconciles each device. What the
// tenant push used to do silently; explicit and audited per device now.
export async function resetTenantOverrides(tenantId) {
  return httpPostJson(`${BASE}/tenants/${encodeURIComponent(tenantId)}/policy/overrides/reset`, {});
}

export async function listTenantPolicyStatus(tenantId) {
  return httpGetJson(`${BASE}/tenants/${encodeURIComponent(tenantId)}/policy-status`);
}

export async function getDevicePolicy(deviceId) {
  return httpGetJson(`${BASE}/devices/${encodeURIComponent(deviceId)}/policy`);
}

export async function saveDevicePolicy(deviceId, policy, opts) {
  return httpPutJson(
    `${BASE}/devices/${encodeURIComponent(deviceId)}/policy`,
    policy,
    buildPutHeaders(opts)
  );
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

/**
 * Read the canonical plugin catalog from the backend. Returned shape:
 *   { ok: true, catalog: PluginCatalogEntry[] }
 *
 * Single source of truth — replaces the legacy hardcoded
 * `src/constants/plugins.js`. Pages should consume this via the
 * `usePluginCatalog` hook so the call is cached and shared across
 * the session.
 */
export async function getPluginCatalog() {
  return httpGetJson(`${BASE}/plugins/catalog`);
}

/**
 * Catálogo del modelo de intención MDM. Misma lógica que el de plugins:
 * el backend es la fuente única (modules/policies/mdm-catalog.ts) y la UI
 * no duplica la lista de ajustes — así no pueden derivar.
 *
 * Devuelve { ok, platforms, settings[] } donde cada setting trae
 * `requiresSupervision`, `platforms` y su `spec` de tipo.
 */
export async function getMdmCatalog(platform) {
  const qs = platform ? `?platform=${encodeURIComponent(platform)}` : "";
  return httpGetJson(`${BASE}/mdm/catalog${qs}`);
}

/**
 * Guardado por dominio a nivel DISPOSITIVO (override). Simétrico de
 * `patchTenantPolicyDomain`: existe para que editar el override de un
 * device no obligue a reenviar el documento completo, que perdería la
 * seguridad ante edición concurrente.
 */
export async function patchDevicePolicyDomain(deviceId, domain, slice, opts) {
  return httpPatchJson(
    `${BASE}/devices/${encodeURIComponent(deviceId)}/policy/domains/${encodeURIComponent(domain)}`,
    slice,
    buildPutHeaders(opts)
  );
}
