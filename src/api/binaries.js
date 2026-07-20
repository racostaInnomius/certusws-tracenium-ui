import { httpGetJson } from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/binaries";


export async function getAgentMetadata({ platform = "windows", arch = "x64" } = {}) {
  return httpGetJson(`${BASE}/agent/metadata${buildQuery({ platform, arch })}`);
}

export async function listAgentVersions({ platform = "windows", arch = "x64" } = {}) {
  return httpGetJson(`${BASE}/agent/versions${buildQuery({ platform, arch })}`);
}
