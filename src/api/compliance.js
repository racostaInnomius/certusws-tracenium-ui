// src/api/compliance.js
//
// Typed-ish client for the /security/compliance/* endpoints. Each
// function returns the raw `{ ok, ... }` envelope the backend sends
// so callers can check `res.ok` before touching `res.items` etc.
// The SCP page unwraps uniformly via a shared helper.

import { httpGetJson } from "./http";

const BASE = "/api/v1/security/compliance";

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

// Tenant-wide KPI: scores, status breakdown, open finding counts.
export async function getComplianceSummary() {
  return httpGetJson(`${BASE}/summary`);
}

// Catalog (Control DB, read-only browse).
export async function getComplianceCatalog(params = {}) {
  return httpGetJson(`${BASE}/catalog${buildQuery(params)}`);
}

// Published framework versions (CIS Win11, CIS macOS, NIST 800-53, NIST CSF).
export async function getFrameworks() {
  return httpGetJson(`${BASE}/frameworks`);
}

// Per-framework tenant aggregate (one row per framework; counts + avg score).
export async function getFrameworkSummary() {
  return httpGetJson(`${BASE}/framework-summary`);
}

// Device posture list — optionally filter/project by framework.
export async function getDevicePosture(params = {}) {
  return httpGetJson(`${BASE}/devices${buildQuery(params)}`);
}

// One device's full drilldown (findings + catalog description inline).
export async function getDeviceDetail(agentId) {
  return httpGetJson(`${BASE}/devices/${encodeURIComponent(agentId)}`);
}

// One device's score trend (daily, capped at 90 days server-side).
export async function getDeviceTimeseries(agentId, windowDays = 30) {
  return httpGetJson(
    `${BASE}/devices/${encodeURIComponent(agentId)}/timeseries${buildQuery({ windowDays })}`
  );
}
