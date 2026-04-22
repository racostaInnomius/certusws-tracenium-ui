const API_BASE = import.meta.env.VITE_API_BASE;

// Default request timeout. Any request that hasn't resolved within this
// window is aborted so the UI can surface an error instead of hanging
// forever when the backend is slow or unresponsive.
const DEFAULT_TIMEOUT_MS = 15_000;

function withTimeout(ms = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    done: () => clearTimeout(timer),
  };
}

async function handleResponse(res) {
  if (res.status === 401) {
    const text = await res.text().catch(() => "");
    throw new Error(`UNAUTHENTICATED:${text}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function toHumanError(err) {
  if (err?.name === "AbortError") {
    return new Error("Request timed out");
  }
  return err;
}

export async function httpGetJson(url, { timeoutMs } = {}) {
  const timeout = withTimeout(timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "GET",
      credentials: "include",
      signal: timeout.signal,
    });
    return await handleResponse(res);
  } catch (err) {
    throw toHumanError(err);
  } finally {
    timeout.done();
  }
}

export async function httpPostJson(url, body, { timeoutMs } = {}) {
  const timeout = withTimeout(timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
    return await handleResponse(res);
  } catch (err) {
    throw toHumanError(err);
  } finally {
    timeout.done();
  }
}

export async function httpPutJson(url, body, { timeoutMs } = {}) {
  const timeout = withTimeout(timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
    return await handleResponse(res);
  } catch (err) {
    throw toHumanError(err);
  } finally {
    timeout.done();
  }
}

export async function httpDeleteJson(url, { timeoutMs } = {}) {
  const timeout = withTimeout(timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "DELETE",
      credentials: "include",
      signal: timeout.signal,
    });
    return await handleResponse(res);
  } catch (err) {
    throw toHumanError(err);
  } finally {
    timeout.done();
  }
}
