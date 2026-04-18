import { httpGetJson } from "./http";

const BASE = "/api/v1/security/audit/events";

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
  return httpGetJson(`${BASE}${buildQuery(params)}`);
}
