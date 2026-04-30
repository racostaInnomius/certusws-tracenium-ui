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

/**
 * Wrap an HTTP failure in an Error that carries enough metadata for
 * callers to branch without parsing the message string.
 *
 * Why: until Phase 2.B we threw `new Error("HTTP 409: <text>")` and
 * callers had to regex-match the message — fragile and inverted the
 * structure that was already in the response. The optimistic-locking
 * flow needs to distinguish 409 (stale policy → reload) from 400
 * (validation → show field errors) from 500 (transient → retry), so
 * we attach `status` and the parsed `body` (when JSON) to the Error
 * instance.
 *
 * Backward compat: `err.message` is unchanged ("HTTP <code>: <text>"),
 * so existing callers that only read `.message` keep working.
 */
async function handleResponse(res) {
  if (res.ok) {
    return res.json();
  }

  const text = await res.text().catch(() => "");
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (res.status === 401) {
    const err = new Error(`UNAUTHENTICATED:${text}`);
    err.status = 401;
    err.body = body;
    throw err;
  }

  const err = new Error(`HTTP ${res.status}: ${text}`);
  err.status = res.status;
  err.body = body;
  throw err;
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

export async function httpPutJson(url, body, { timeoutMs, headers } = {}) {
  const timeout = withTimeout(timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "PUT",
      credentials: "include",
      // Spread caller-provided headers AFTER Content-Type so they can't
      // accidentally override it. Used today for `If-Match` (Phase 2.B
      // optimistic locking on policy writes); future call sites can add
      // more without touching the signature.
      headers: { "Content-Type": "application/json", ...(headers || {}) },
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

export async function httpPatchJson(url, body, { timeoutMs } = {}) {
  const timeout = withTimeout(timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "PATCH",
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
