import { httpGetJson } from "./http";

const API_BASE = import.meta.env.VITE_API_BASE;

export async function listTokens() {
  return httpGetJson("/api/v1/security/enroll/tokens");
}

export async function createToken(payload) {
  const res = await fetch(`${API_BASE}/api/v1/security/enroll/tokens`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create token failed: ${text}`);
  }

  return res.json();
}

export async function revokeToken(id) {
  const res = await fetch(
    `${API_BASE}/api/v1/security/enroll/tokens/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Revoke token failed: ${text}`);
  }

  return res.json();
}