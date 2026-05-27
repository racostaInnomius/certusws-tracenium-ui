import { httpDeleteJson, httpGetJson, httpPostJson } from "./http";

export async function listTokens() {
  return httpGetJson("/api/v1/security/enroll/tokens");
}

export async function getTokenQuota() {
  return httpGetJson("/api/v1/security/enroll/tokens/quota");
}

export async function createToken(payload) {
  return httpPostJson("/api/v1/security/enroll/tokens", payload);
}

export async function revokeToken(id) {
  return httpDeleteJson(
    `/api/v1/security/enroll/tokens/${encodeURIComponent(id)}`
  );
}
