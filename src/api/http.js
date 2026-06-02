// src/api/http.js
//
// Tracenium HTTP helpers with enterprise-grade GET cache and temporary
// server error handling.
//
// Rules:
// - 401 / UNAUTHENTICATED remains an auth error. The app may redirect/login.
// - 503 / TEMPORARY_SERVER_ERROR / retryable=true / network timeout is temporary.
//   It must NOT logout the user.
// - GET requests keep and reuse last-known-good data when a temporary refresh
//   fails, while a global non-blocking warning is emitted.

const API_BASE = import.meta.env.VITE_API_BASE;

const DEFAULT_TIMEOUT_MS = 15_000;
const STORAGE_PREFIX = "tnm:http-cache:";
const SESSION_SCOPE_STORAGE_KEY = "tnm:session-cache-scope:v1";
const DEFAULT_SESSION_SCOPE = "anonymous";

const DEFAULT_STALE_MS = 60_000;
const DEFAULT_STORAGE_MAX_AGE_MS = 10 * 60_000;

export const TEMPORARY_ERROR_EVENT = "tracenium:temporary-server-error";
export const AUTH_REQUIRED_EVENT = "tracenium:auth-required";

let authRedirectStarted = false;

const memCache = new Map();
const inFlightGets = new Map();

function readStoredSessionScope() {
  if (typeof window === "undefined") return DEFAULT_SESSION_SCOPE;

  try {
    const stored = window.sessionStorage?.getItem(SESSION_SCOPE_STORAGE_KEY);
    return stored || DEFAULT_SESSION_SCOPE;
  } catch {
    return DEFAULT_SESSION_SCOPE;
  }
}

let currentSessionScope = readStoredSessionScope();

export class AuthError extends Error {
  constructor(message = "UNAUTHENTICATED", options = {}) {
    super(message);
    this.name = "AuthError";
    this.status = options.status ?? 401;
    this.body = options.body ?? null;
    this.code = options.code || "UNAUTHENTICATED";
  }
}

export class TemporaryServerError extends Error {
  constructor(message = "Unable to refresh data. Showing last available data.", options = {}) {
    super(message);
    this.name = "TemporaryServerError";
    this.status = options.status ?? null;
    this.body = options.body ?? null;
    this.code = options.code || "TEMPORARY_SERVER_ERROR";
    this.retryable = true;
    this.url = options.url || "";
    this.cause = options.cause;
  }
}

function normalizeSessionScope(scope) {
  const normalized = String(scope || "").trim();
  return normalized || DEFAULT_SESSION_SCOPE;
}

export function getApiCacheSessionScope() {
  return currentSessionScope || DEFAULT_SESSION_SCOPE;
}

export function setApiCacheSessionScope(scope) {
  const nextScope = normalizeSessionScope(scope);
  const previousScope = normalizeSessionScope(currentSessionScope);

  currentSessionScope = nextScope;
  authRedirectStarted = false;

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage?.setItem(SESSION_SCOPE_STORAGE_KEY, nextScope);
    } catch {
      // best effort
    }
  }

  if (nextScope !== previousScope) {
    clearApiCache();
  }

  return nextScope;
}


export function getLoginUrl() {
  return `${API_BASE}/auth/login`;
}

/**
 * Build an absolute WebSocket URL for an API path (e.g. the RCP signaling
 * endpoint). The signaling WS lives on the BACKEND origin (api.tracenium.com),
 * NOT the SPA origin (portal.tracenium.com) — resolving against
 * `window.location` connected the browser to the static-site host, which has
 * no WS upgrade handler, so every signaling socket failed. We resolve against
 * `VITE_API_BASE` instead, mirroring how every REST call uses `${API_BASE}`.
 *
 * `pathOrUrl` may be an absolute URL (returned as-is, scheme normalized) or a
 * server-relative path like `/api/v1/remote-control/signaling/<id>`.
 *
 * Fallback: if VITE_API_BASE is unset or relative (some local-dev configs use a
 * Vite proxy with a relative base), resolve against the page origin — correct
 * there because dev serves API + WS from the same host.
 */
export function getApiWsUrl(pathOrUrl) {
  const toWs = (u) => {
    const url = new URL(u);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  };

  // Absolute base (prod): https://api.tracenium.com → wss://api.tracenium.com
  if (API_BASE && /^https?:\/\//i.test(API_BASE)) {
    return toWs(new URL(pathOrUrl, API_BASE).toString());
  }

  // Relative/unset base (dev with proxy): resolve against the page origin.
  if (typeof window !== "undefined") {
    return toWs(new URL(pathOrUrl, window.location.href).toString());
  }

  return pathOrUrl;
}

function emitAuthRequired(err, { url } = {}) {
  if (typeof window === "undefined") return;

  if (authRedirectStarted) return;
  authRedirectStarted = true;

  const detail = {
    url,
    status: err?.status ?? 401,
    code: err?.code || err?.body?.error || "UNAUTHENTICATED",
    message: err?.body?.message || err?.message || "UNAUTHENTICATED",
    ts: now(),
  };

  try {
    clearApiCache();
  } catch {
    // best effort
  }

  let handled = false;

  try {
    const event = new CustomEvent(AUTH_REQUIRED_EVENT, {
      cancelable: true,
      detail,
    });

    handled = window.dispatchEvent(event) === false;
  } catch {
    handled = false;
  }

  // Safety fallback: even if no React listener is mounted or a view swallows
  // the AuthError in a local catch/useCachedFetch, a backend-confirmed 401
  // must not leave the operator inside protected screens.
  if (!handled) {
    window.setTimeout(() => {
      try {
        if (window.location.href !== getLoginUrl()) {
          window.location.assign(getLoginUrl());
        }
      } catch {
        window.location.href = getLoginUrl();
      }
    }, 50);
  }
}

function withTimeout(ms = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    done: () => clearTimeout(timer),
  };
}

function now() {
  return Date.now();
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function storageKey(cacheKey) {
  return `${STORAGE_PREFIX}${cacheKey}`;
}

function normalizeGetOptions(url, options = {}) {
  const profile = getCacheProfileForUrl(url);

  return {
    timeoutMs: options.timeoutMs,
    cache: options.cache || profile.cache || "default",
    staleMs: Number(options.staleMs ?? profile.staleMs ?? DEFAULT_STALE_MS),
    storageMaxAgeMs: Number(
      options.storageMaxAgeMs ??
        profile.storageMaxAgeMs ??
        DEFAULT_STORAGE_MAX_AGE_MS
    ),
    notifyOnTemporaryError: options.notifyOnTemporaryError !== false,
  };
}

function getCacheProfileForUrl(url) {
  const normalized = String(url || "").toLowerCase();

  // Auth/session state should always be live.
  if (
    normalized.includes("/auth/") ||
    normalized.includes("/logout") ||
    normalized.includes("/bootstrap")
  ) {
    return { cache: "no-store" };
  }

  // Health checks are intentionally live probes.
  if (
    normalized.includes("/api/v1/health") ||
    normalized.endsWith("/health")
  ) {
    return { cache: "no-store" };
  }

  // Binary/report/download endpoints should not be JSON cached here.
  if (
    normalized.includes("/download") ||
    normalized.includes("/export") ||
    normalized.includes("/attachment") ||
    normalized.includes("/file")
  ) {
    return { cache: "no-store" };
  }

  // Very volatile operational views: give a tiny cache to avoid duplicate
  // bursts, but do not keep stale data around for long.
  if (
    normalized.includes("/devices-connected") ||
    normalized.includes("/device-decommission-jobs") ||
    normalized.includes("/device-deletion-jobs") ||
    normalized.includes("/remote-control") ||
    normalized.includes("/jobs") ||
    normalized.includes("/alerts/unread")
  ) {
    return {
      staleMs: 10_000,
      storageMaxAgeMs: 30_000,
    };
  }

  // Heavy dashboard/inventory/config pages benefit most from cache.
  if (
    normalized.includes("/dashboard") ||
    normalized.includes("/configurations") ||
    normalized.includes("/asset-groups") ||
    normalized.includes("/security/compliance") ||
    normalized.includes("/patch-management")
  ) {
    return {
      staleMs: 90_000,
      storageMaxAgeMs: 15 * 60_000,
    };
  }

  return {
    staleMs: DEFAULT_STALE_MS,
    storageMaxAgeMs: DEFAULT_STORAGE_MAX_AGE_MS,
  };
}

function buildCacheKey(url) {
  const rawKey = String(url || "");
  return `${getApiCacheSessionScope()}::${rawKey}`;
}

function unscopedCacheKey(cacheKey) {
  const text = String(cacheKey || "");
  const marker = "::";
  const markerIndex = text.indexOf(marker);
  return markerIndex >= 0 ? text.slice(markerIndex + marker.length) : text;
}

function isExpired(entry, storageMaxAgeMs) {
  if (!entry || !entry.ts) return true;
  return now() - Number(entry.ts) > Number(storageMaxAgeMs || 0);
}

function isFresh(entry, staleMs) {
  if (!entry || !entry.ts) return false;
  return now() - Number(entry.ts) <= Number(staleMs || 0);
}

function readGetCache(cacheKey, options) {
  if (memCache.has(cacheKey)) {
    const entry = memCache.get(cacheKey);

    if (!isExpired(entry, options.storageMaxAgeMs)) {
      return entry;
    }

    memCache.delete(cacheKey);
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage?.getItem(storageKey(cacheKey));
    if (!raw) return null;

    const parsed = safeJsonParse(raw);

    if (!parsed || isExpired(parsed, options.storageMaxAgeMs)) {
      window.sessionStorage?.removeItem(storageKey(cacheKey));
      return null;
    }

    memCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeGetCache(cacheKey, data) {
  const entry = {
    data,
    ts: now(),
  };

  memCache.set(cacheKey, entry);

  if (typeof window === "undefined") return entry;

  try {
    window.sessionStorage?.setItem(storageKey(cacheKey), JSON.stringify(entry));
  } catch {
    // Non-fatal. Some payloads may be too large for sessionStorage.
    // Memory cache still helps during the active tab session.
  }

  return entry;
}

export function invalidateApiCache(key) {
  if (!key) return;

  const cacheKey = buildCacheKey(key);
  memCache.delete(cacheKey);

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage?.removeItem(storageKey(cacheKey));
  } catch {
    // best effort
  }
}

export function invalidateApiCachePrefix(prefix) {
  if (!prefix) return;

  const normalizedPrefix = String(prefix);

  Array.from(memCache.keys()).forEach((key) => {
    if (unscopedCacheKey(key).startsWith(normalizedPrefix)) {
      memCache.delete(key);
    }
  });

  if (typeof window === "undefined") return;

  try {
    const keysToRemove = [];

    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);

      if (
        key &&
        key.startsWith(STORAGE_PREFIX) &&
        unscopedCacheKey(key.slice(STORAGE_PREFIX.length)).startsWith(normalizedPrefix)
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // best effort
  }
}

export function clearApiCache() {
  memCache.clear();
  inFlightGets.clear();

  if (typeof window === "undefined") return;

  try {
    const keysToRemove = [];

    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);

      if (key && key.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // best effort
  }
}

function invalidateAfterMutation(url) {
  // Correctness > over-optimizing here: any write can affect dashboards,
  // asset groups, settings cards, tokens, certificates, etc. Clearing all
  // cached GETs prevents stale cards/tables after mutations.
  clearApiCache();

  // Keep the URL parameter for future narrower invalidation if needed.
  void url;
}

function getBodyErrorCode(body) {
  return String(body?.error || body?.code || "").trim().toUpperCase();
}

function isRetryableBody(body) {
  return body?.retryable === true || getBodyErrorCode(body) === "TEMPORARY_SERVER_ERROR";
}

export function isAuthError(err) {
  const code = String(err?.code || err?.body?.error || err?.message || "").toUpperCase();
  return err?.status === 401 || code.includes("UNAUTHENTICATED");
}

export function isTemporaryApiError(err) {
  if (!err) return false;

  const message = String(err.message || "").toLowerCase();
  const code = String(err.code || err.body?.error || "").toUpperCase();

  return (
    err instanceof TemporaryServerError ||
    err.retryable === true ||
    err.status === 503 ||
    err.status >= 500 ||
    code === "TEMPORARY_SERVER_ERROR" ||
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("failed to fetch") ||
    message.includes("network error") ||
    message.includes("request timed out") ||
    message.includes("connection terminated") ||
    message.includes("timeout exceeded") ||
    message.includes("remaining connection slots")
  );
}

export function getTemporaryErrorMessage(err) {
  return (
    err?.body?.message ||
    err?.message ||
    "Unable to refresh data. Showing last available data."
  );
}

function emitTemporaryError(err, { url, cacheKey, hasCachedData } = {}) {
  if (typeof window === "undefined") return;

  const detail = {
    url,
    cacheKey,
    hasCachedData: Boolean(hasCachedData),
    message: "Unable to refresh data. Showing last available data.",
    originalMessage: getTemporaryErrorMessage(err),
    status: err?.status ?? null,
    code: err?.code || err?.body?.error || "TEMPORARY_SERVER_ERROR",
    retryable: true,
    ts: now(),
  };

  window.dispatchEvent(new CustomEvent(TEMPORARY_ERROR_EVENT, { detail }));
}

async function handleResponse(res, url = "") {
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

  if (res.status === 401 || getBodyErrorCode(body) === "UNAUTHENTICATED") {
    const err = new AuthError(body?.message || `UNAUTHENTICATED:${text}`, {
      status: 401,
      body,
      code: "UNAUTHENTICATED",
    });

    emitAuthRequired(err, { url });
    throw err;
  }

  if (res.status === 503 || isRetryableBody(body) || res.status >= 500) {
    throw new TemporaryServerError(
      body?.message || "Unable to refresh data. Showing last available data.",
      {
        status: res.status,
        body,
        code: getBodyErrorCode(body) || "TEMPORARY_SERVER_ERROR",
        url,
      }
    );
  }

  const err = new Error(`HTTP ${res.status}: ${text}`);
  err.status = res.status;
  err.body = body;
  err.code = getBodyErrorCode(body) || `HTTP_${res.status}`;
  throw err;
}

function toHumanError(err, url = "") {
  if (err instanceof AuthError || isAuthError(err)) {
    emitAuthRequired(err, { url });
    return err instanceof AuthError
      ? err
      : new AuthError(err?.message || "UNAUTHENTICATED", {
          status: err?.status ?? 401,
          body: err?.body ?? null,
          code: "UNAUTHENTICATED",
        });
  }

  if (err instanceof TemporaryServerError) {
    return err;
  }

  if (err?.name === "AbortError") {
    return new TemporaryServerError("Request timed out", {
      code: "REQUEST_TIMEOUT",
      url,
      cause: err,
    });
  }

  const message = String(err?.message || "");

  if (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Network Error") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNRESET")
  ) {
    return new TemporaryServerError(message || "Network Error", {
      code: "NETWORK_ERROR",
      url,
      cause: err,
    });
  }

  return err;
}

async function fetchGetJson(url, options) {
  const timeout = withTimeout(options.timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "GET",
      credentials: "include",
      signal: timeout.signal,
    });

    return await handleResponse(res, url);
  } catch (err) {
    throw toHumanError(err, url);
  } finally {
    timeout.done();
  }
}

export async function httpGetJson(url, options = {}) {
  const normalizedOptions = normalizeGetOptions(url, options);
  const cacheKey = buildCacheKey(url);

  if (normalizedOptions.cache === "no-store") {
    return fetchGetJson(url, normalizedOptions);
  }

  const entry = readGetCache(cacheKey, normalizedOptions);

  if (
    normalizedOptions.cache !== "reload" &&
    entry &&
    isFresh(entry, normalizedOptions.staleMs)
  ) {
    return entry.data;
  }

  if (inFlightGets.has(cacheKey)) {
    return inFlightGets.get(cacheKey);
  }

  const promise = fetchGetJson(url, normalizedOptions)
    .then((fresh) => {
      writeGetCache(cacheKey, fresh);
      return fresh;
    })
    .catch((err) => {
      const temp = isTemporaryApiError(err);
      const cachedEntry = readGetCache(cacheKey, normalizedOptions);

      if (temp && cachedEntry) {
        if (normalizedOptions.notifyOnTemporaryError) {
          emitTemporaryError(err, {
            url,
            cacheKey,
            hasCachedData: true,
          });
        }
        return cachedEntry.data;
      }

      if (temp && normalizedOptions.notifyOnTemporaryError) {
        emitTemporaryError(err, {
          url,
          cacheKey,
          hasCachedData: false,
        });
      }

      throw err;
    })
    .finally(() => {
      inFlightGets.delete(cacheKey);
    });

  inFlightGets.set(cacheKey, promise);

  return promise;
}

export async function prefetchApiGetJson(url, options = {}) {
  return httpGetJson(url, options);
}

export function getApiCacheSnapshot(url, options = {}) {
  const normalizedOptions = normalizeGetOptions(url, options);
  const entry = readGetCache(buildCacheKey(url), normalizedOptions);

  if (!entry) {
    return {
      data: null,
      hasCache: false,
      lastUpdatedAt: null,
      cacheAgeMs: null,
      isStale: true,
    };
  }

  const cacheAgeMs = Math.max(0, now() - Number(entry.ts));

  return {
    data: entry.data,
    hasCache: true,
    lastUpdatedAt: entry.ts,
    cacheAgeMs,
    isStale: cacheAgeMs > normalizedOptions.staleMs,
  };
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

    const json = await handleResponse(res, url);
    invalidateAfterMutation(url);
    return json;
  } catch (err) {
    throw toHumanError(err, url);
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
      headers: { "Content-Type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });

    const json = await handleResponse(res, url);
    invalidateAfterMutation(url);
    return json;
  } catch (err) {
    throw toHumanError(err, url);
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

    const json = await handleResponse(res, url);
    invalidateAfterMutation(url);
    return json;
  } catch (err) {
    throw toHumanError(err, url);
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

    const json = await handleResponse(res, url);
    invalidateAfterMutation(url);
    return json;
  } catch (err) {
    throw toHumanError(err, url);
  } finally {
    timeout.done();
  }
}
