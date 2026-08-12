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
  httpPostBinary,
} from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/software-delivery";


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

// ── AI Intake (upload → verify → AI proposal → review) ────────────

// Upload an installer binary. The bytes are the body (octet-stream); the
// filename + operator hints ride in the query string. Returns the persisted
// intake record (verdict + proposal), 201 even when the verdict is `blocked`.
export async function uploadIntake(file, hints = {}) {
  const params = {
    filename: hints.filename ?? file?.name ?? "package.bin",
    name: hints.name,
    vendor: hints.vendor,
    version: hints.version,
    declaredSha256: hints.declaredSha256,
  };
  return httpPostBinary(`${BASE}/intake${buildQuery(params)}`, file);
}

export async function listIntakes(params = {}) {
  return httpGetJson(`${BASE}/intake${buildQuery(params)}`);
}

// ── Distribution (Phase B) — sites + distribution points ──────────

export async function listSites() {
  return httpGetJson(`${BASE}/distribution/sites`);
}

export async function createSite(payload) {
  return httpPostJson(`${BASE}/distribution/sites`, payload);
}

export async function updateSite(id, payload) {
  return httpPatchJson(`${BASE}/distribution/sites/${encodeURIComponent(id)}`, payload);
}

export async function deleteSite(id) {
  return httpDeleteJson(`${BASE}/distribution/sites/${encodeURIComponent(id)}`);
}

export async function listDistributionPoints() {
  return httpGetJson(`${BASE}/distribution/dps`);
}

export async function upsertDistributionPoint(payload) {
  return httpPostJson(`${BASE}/distribution/dps`, payload);
}

export async function deleteDistributionPoint(id) {
  return httpDeleteJson(`${BASE}/distribution/dps/${encodeURIComponent(id)}`);
}

export async function getIntake(id) {
  return httpGetJson(`${BASE}/intake/${encodeURIComponent(id)}`);
}

// Approve a pending intake — creates the catalog package from the (optionally
// operator-edited) proposal and marks the intake approved. `overrides` is a
// partial CreateSoftwarePackageInput.
export async function approveIntake(id, overrides = {}) {
  return httpPostJson(`${BASE}/intake/${encodeURIComponent(id)}/approve`, overrides);
}

export async function rejectIntake(id) {
  return httpPostJson(`${BASE}/intake/${encodeURIComponent(id)}/reject`, {});
}
