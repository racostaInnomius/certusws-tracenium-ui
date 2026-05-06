// src/api/softwareDelivery.js
//
// Wrapper over /api/v1/software-delivery — the actual SDP feature
// (third-party software deployment to the fleet). Distinct from
// /api/v1/agent-releases (Tracenium agent installer catalog), which
// formerly lived at this path until the 2026-05-01 rename.

import {
  httpGetJson,
  httpPostJson,
  httpPatchJson,
  httpDeleteJson,
} from "./http";

const BASE = "/api/v1/software-delivery";

function buildQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      q.append(k, String(v));
    }
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ── Catalog (software_packages) ──────────────────────────────────

export async function listPackages(params = {}) {
  return httpGetJson(`${BASE}${buildQuery(params)}`);
}

export async function getPackage(id) {
  return httpGetJson(`${BASE}/${encodeURIComponent(id)}`);
}

export async function createPackage(payload) {
  return httpPostJson(BASE, payload);
}

export async function updatePackage(id, payload) {
  return httpPatchJson(`${BASE}/${encodeURIComponent(id)}`, payload);
}

export async function deletePackage(id) {
  return httpDeleteJson(`${BASE}/${encodeURIComponent(id)}`);
}

// ── Deployments ───────────────────────────────────────────────────

export async function deployPackage(packageId, body) {
  // Fan-out: backend resolves target, snapshots package, creates one
  // job per device. Returns 202 with the deployment + initial counts.
  return httpPostJson(
    `${BASE}/${encodeURIComponent(packageId)}/deploy`,
    body
  );
}

export async function listDeployments(params = {}) {
  return httpGetJson(`${BASE}/deployments${buildQuery(params)}`);
}

export async function getDeployment(id) {
  return httpGetJson(`${BASE}/deployments/${encodeURIComponent(id)}`);
}

export async function listDeploymentResults(id) {
  return httpGetJson(
    `${BASE}/deployments/${encodeURIComponent(id)}/results`
  );
}

export async function cancelDeployment(id) {
  return httpPostJson(
    `${BASE}/deployments/${encodeURIComponent(id)}/cancel`,
    {}
  );
}
