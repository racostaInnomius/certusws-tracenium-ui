// src/api/agentReleases.js
//
// Wrapper over /api/v1/agent-releases. Renamed from
// `softwareDelivery.js` (2026-05-01) so the `software-delivery` name
// is free for the actual SDP feature (third-party software
// deployment to the fleet). The backend still serves both
// `/api/v1/agent-releases` and the deprecated `/api/v1/software-delivery`
// alias during the transition window.

import {
  httpGetJson,
  httpPostJson,
  httpPutJson,
  httpDeleteJson,
} from "./http";

const BASE = "/api/v1/agent-releases";

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

export async function listAgentReleases(params = {}) {
  return httpGetJson(`${BASE}${buildQuery(params)}`);
}

export async function getAgentReleaseById(id) {
  return httpGetJson(`${BASE}/${id}`);
}

export async function createAgentRelease(payload) {
  return httpPostJson(BASE, payload);
}

export async function updateAgentRelease(id, payload) {
  return httpPutJson(`${BASE}/${id}`, payload);
}

export async function deleteAgentRelease(id) {
  return httpDeleteJson(`${BASE}/${id}`);
}

export async function resolveAgentReleaseDownload(downloadPath) {
  return httpGetJson(downloadPath);
}
