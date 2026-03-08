const API_BASE = import.meta.env.VITE_API_BASE;

export async function httpGetJson(url) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "GET",
    credentials: "include" // importante si OIDC usa cookies
  });

  // ❗️Ya no redirigimos aquí. AuthGate es el único que redirige.
  if (res.status === 401) {
    const text = await res.text().catch(() => "");
    throw new Error(`UNAUTHENTICATED:${text}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return await res.json();
}