const API_BASE = import.meta.env.VITE_API_BASE;

export async function httpGetJson(url) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "GET",
    credentials: "include",
  });

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

export async function httpPostJson(url, body) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

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

export async function httpPutJson(url, body) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

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

export async function httpDeleteJson(url) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "DELETE",
    credentials: "include",
  });

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