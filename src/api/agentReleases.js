// src/api/agentReleases.js
//
// Wrapper over /api/v1/agent-releases. Renamed from
// `softwareDelivery.js` (2026-05-01) so the `software-delivery` name
// is free for the actual SDP feature (third-party software
// deployment to the fleet). The transition alias at
// `/api/v1/software-delivery` was dropped in Batch 3.

import {
  httpGetJson,
  httpPostJson,
  httpPutJson,
  httpDeleteJson,
} from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/agent-releases";


export async function listAgentReleases(params = {}) {
  return httpGetJson(`${BASE}${buildQuery(params)}`);
}

export async function getAgentReleaseById(id) {
  return httpGetJson(`${BASE}/${encodeURIComponent(id)}`);
}

export async function createAgentRelease(payload) {
  return httpPostJson(BASE, payload);
}

export async function updateAgentRelease(id, payload) {
  return httpPutJson(`${BASE}/${encodeURIComponent(id)}`, payload);
}

export async function deleteAgentRelease(id) {
  return httpDeleteJson(`${BASE}/${encodeURIComponent(id)}`);
}

export async function resolveAgentReleaseDownload(downloadPath) {
  return httpGetJson(downloadPath);
}
