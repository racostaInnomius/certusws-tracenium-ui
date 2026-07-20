import { httpGetJson } from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/security/audit";


export async function listAuditEvents(params = {}) {
  return httpGetJson(`${BASE}/events${buildQuery(params)}`);
}

export async function getAuditSummary(params = {}) {
  return httpGetJson(`${BASE}/summary${buildQuery(params)}`);
}

export async function getAuditFacets(params = {}) {
  return httpGetJson(`${BASE}/facets${buildQuery(params)}`);
}
