// src/api/assetGroups.js
//
// Thin wrapper over /api/v1/asset-groups. Mirrors the shape used by
// other api/* modules so call sites stay consistent.

import {
  httpDeleteJson,
  httpGetJson,
  httpPatchJson,
  httpPostJson,
} from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/asset-groups";


export async function listAssetGroups(params = {}) {
  return httpGetJson(`${BASE}${buildQuery(params)}`);
}

export async function getAssetGroup(id) {
  return httpGetJson(`${BASE}/${encodeURIComponent(id)}`);
}

export async function createAssetGroup(payload) {
  return httpPostJson(BASE, payload);
}

export async function updateAssetGroup(id, payload) {
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

export async function addAssetGroupMembers(id, deviceIds = []) {
  return httpPostJson(`${BASE}/${encodeURIComponent(id)}/members`, {
    deviceIds,
  });
}

export async function removeAssetGroupMember(id, deviceId) {
  return httpDeleteJson(
    `${BASE}/${encodeURIComponent(id)}/members/${encodeURIComponent(deviceId)}`
  );
}

export async function getCriteriaCatalog() {
  return httpGetJson(`${BASE}/criteria-catalog`);
}

export async function getCriteriaSuggestions(params = {}) {
  return httpGetJson(`${BASE}/criteria-suggestions${buildQuery(params)}`);
}

export async function getAssetGroupCoverage() {
  return httpGetJson(`${BASE}/coverage`);
}

export async function listUngroupedDevices(params = {}) {
  return httpGetJson(`${BASE}/ungrouped-devices${buildQuery(params)}`);
}

export async function previewAssetGroupCriteria(criteriaJson, sampleSize) {
  return httpPostJson(`${BASE}/preview`, {
    criteriaJson,
    ...(sampleSize !== undefined ? { sampleSize } : {}),
  });
}

export async function dispatchAssetGroupJob(id, payload) {
  return httpPostJson(`${BASE}/${encodeURIComponent(id)}/jobs`, payload);
}