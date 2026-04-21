import { httpGetJson } from "./http";

const BASE = "/api/v1/binaries";

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

export async function getAgentMetadata({ platform = "windows", arch = "x64" } = {}) {
  return httpGetJson(`${BASE}/agent/metadata${buildQuery({ platform, arch })}`);
}

export async function listAgentVersions({ platform = "windows", arch = "x64" } = {}) {
  return httpGetJson(`${BASE}/agent/versions${buildQuery({ platform, arch })}`);
}
