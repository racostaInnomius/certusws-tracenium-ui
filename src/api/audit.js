import { httpGetJson } from "./http";

const BASE = "/api/v1/security/audit";

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

export async function listAuditEvents(params = {}) {
  return httpGetJson(`${BASE}/events${buildQuery(params)}`);
}

export async function getAuditSummary(params = {}) {
  return httpGetJson(`${BASE}/summary${buildQuery(params)}`);
}

export async function getAuditFacets(params = {}) {
  return httpGetJson(`${BASE}/facets${buildQuery(params)}`);
}
