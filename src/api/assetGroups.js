// src/api/assetGroups.js
//
// Thin wrapper over /api/v1/asset-groups. Mirrors the shape used by
// other api/* modules so call sites stay consistent — every function
// returns the parsed JSON; errors are thrown as Error with .status and
// .body attached (see src/api/http.js).

import {
  httpDeleteJson,
  httpGetJson,
  httpPatchJson,
  httpPostJson,
} from "./http";

const BASE = "/api/v1/asset-groups";

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

export async function listAssetGroups() {
  return httpGetJson(BASE);
}

export async function getAssetGroup(id) {
  return httpGetJson(`${BASE}/${encodeURIComponent(id)}`);
}

export async function createAssetGroup(payload) {
  return httpPostJson(BASE, payload);
}

export async function updateAssetGroup(id, payload) {
  // PATCH semantics — only the fields included in the body are
  // updated. Backend validates each field independently.
  return httpPatchJson(`${BASE}/${encodeURIComponent(id)}`, payload);
}

export async function deleteAssetGroup(id) {
  return httpDeleteJson(`${BASE}/${encodeURIComponent(id)}`);
}

export async function listAssetGroupMembers(id, params = {}) {
  return httpGetJson(
    `${BASE}/${encodeURIComponent(id)}/members${buildQuery(params)}`
  );
}

export async function addAssetGroupMembers(id, deviceIds) {
  return httpPostJson(`${BASE}/${encodeURIComponent(id)}/members`, { deviceIds });
}

export async function removeAssetGroupMember(id, deviceId) {
  return httpDeleteJson(
    `${BASE}/${encodeURIComponent(id)}/members/${encodeURIComponent(deviceId)}`
  );
}

// ── Phase 2: dynamic groups ─────────────────────────────────────

// Catalog of fields + ops the criteria builder can render. Backend
// is the source of truth so adding a new field doesn't require a UI
// change. Cached at the page level — the catalog is static during
// a session.
export async function getCriteriaCatalog() {
  return httpGetJson(`${BASE}/criteria-catalog`);
}

// Phase 3: dispatch a job to every device that's currently a member
// of the group. Backend resolves membership at request time (static
// from DB, dynamic via criteria evaluation) and fans out one job
// per device through the same orchestrator pipeline as a tenant-wide
// job. Returns `{ ok, groupId, groupName, groupKind, count, jobs }`.
//
// payload shape: { jobType, payload, timeoutSeconds?, maxAttempts? }
export async function dispatchAssetGroupJob(id, payload) {
  return httpPostJson(
    `${BASE}/${encodeURIComponent(id)}/jobs`,
    payload
  );
}

// Live-evaluate criteria against the tenant DB without persisting.
// Used by the criteria builder to show "this matches N devices" as
// the operator types. `sampleSize` defaults to 5; backend caps it
// at 50 server-side.
export async function previewAssetGroupCriteria(criteriaJson, sampleSize) {
  return httpPostJson(`${BASE}/preview`, {
    criteriaJson,
    ...(sampleSize !== undefined ? { sampleSize } : {}),
  });
}

export async function getCriteriaSuggestions(params = {}) {
  return httpGetJson(`${BASE}/criteria-suggestions${buildQuery(params)}`);
}