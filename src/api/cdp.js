// src/api/cdp.js
//
// CDP (Crypto Discovery Plugin) — certificates discovered ON devices by
// the cdp agent plugin. NOT the same API as certificates.js
// (/api/v1/security/certificates), which covers the agent's own
// mTLS/PKI identity certs.

import { httpGetJson } from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/cdp";

export async function getCdpSummary() {
  return httpGetJson(`${BASE}/summary`);
}

// Aggregate panels for the Dashboard tab (expiry horizon, hygiene
// breakdown, issuers, distribution, worklist) in one round trip.
export async function getCdpDashboard() {
  return httpGetJson(`${BASE}/dashboard`);
}

// Post-quantum readiness: the "valid beyond 2030/2035" metric plus the
// crypto-agility blockers (ADR-0004 e-F1/e-F2).
export async function getCdpPqcReadiness() {
  return httpGetJson(`${BASE}/pqc`);
}

export async function listCdpCertificates(params = {}) {
  return httpGetJson(`${BASE}/certificates${buildQuery(params)}`);
}

export async function getCdpCertificateDetail(fingerprint) {
  return httpGetJson(`${BASE}/certificates/${encodeURIComponent(fingerprint)}`);
}

export async function listCdpDevices(params = {}) {
  return httpGetJson(`${BASE}/devices${buildQuery(params)}`);
}

export async function listCdpDeviceCertificates(agentId, params = {}) {
  return httpGetJson(
    `${BASE}/devices/${encodeURIComponent(agentId)}/certificates${buildQuery(params)}`
  );
}

export async function listCdpExpiring(params = {}) {
  return httpGetJson(`${BASE}/expiring${buildQuery(params)}`);
}
