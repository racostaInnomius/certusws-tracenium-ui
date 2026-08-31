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
import { createEntryCache } from "./entryCache";

const STORAGE_PREFIX = "tnm:http-cache:";
const SESSION_SCOPE_STORAGE_KEY = "tnm:session-cache-scope:v1";
const DEFAULT_SESSION_SCOPE = "anonymous";

const DEFAULT_STALE_MS = 60_000;
const DEFAULT_STORAGE_MAX_AGE_MS = 10 * 60_000;

export const TEMPORARY_ERROR_EVENT = "tracenium:temporary-server-error";
export const AUTH_REQUIRED_EVENT = "tracenium:auth-required";
// ADR-0011 (backend) — fired whenever any API call gets back a 403
// PERMISSION_DENIED (a custom role attempting a capability it wasn't
// granted). AppShell listens globally and shows a dialog with the
// backend's own human-readable message — the product's explicit "don't
// hide the feature, explain on attempt" requirement.
export const PERMISSION_DENIED_EVENT = "tracenium:permission-denied";

let authRedirectStarted = false;

const inFlightGets = new Map();

// Cross-cache clear hooks. http.js owns the session scope + active tenant (the
// single source of truth both this cache and hooks/useCachedFetch.js key by).
// When the identity changes (session scope flips), every registered secondary
// cache must be cleared too. useCachedFetch registers its clearer here, so a
// single setApiCacheSessionScope() call wipes both caches — no more manually
// keeping two scope states in sync at every auth-change site.
const cacheClearListeners = new Set();

/** Register a callback fired when the session scope changes (identity change). */
export function registerCacheClearListener(cb) {
  if (typeof cb === "function") cacheClearListeners.add(cb);
  return () => cacheClearListeners.delete(cb);
}

/**
 * The scope the caches were last keyed under, remembered across tabs.
 *
 * ⚠️ This MUST outlive the tab, and it lives in localStorage for one reason:
 * `setApiCacheSessionScope` wipes both caches whenever the scope it is handed
 * differs from the remembered one. Reading the previous scope from
 * sessionStorage meant a fresh tab always started at DEFAULT_SESSION_SCOPE, so
 * the first bootstrap of every new tab looked like a user switch and cleared
 * the cache — defeating the persisted entries entirely, no matter which store
 * held them.
 *
 * The wipe still fires when it should: a genuinely different subject+email
 * mismatches the remembered scope, and performLogout() stamps "signed-out",
 * so signing out still guarantees the next sign-in starts cold.
 */
function readStoredSessionScope() {
  if (typeof window === "undefined") return DEFAULT_SESSION_SCOPE;

  try {
    const stored = window.localStorage?.getItem(SESSION_SCOPE_STORAGE_KEY);
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

export class PermissionDeniedError extends Error {
  constructor(message = "PERMISSION_DENIED", options = {}) {
    super(message);
    this.name = "PermissionDeniedError";
    this.status = options.status ?? 403;
    this.body = options.body ?? null;
    this.code = options.code || "PERMISSION_DENIED";
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

// ── MSP active tenant (F1) ────────────────────────────────────────────
//
// When an MSP operator / vendor selects a client from the portfolio, its
// internal Tenant.Id is set here and sent as the X-Tenant-Id header on
// EVERY subsequent API call. The backend's tenantMiddleware authorizes it
// via the hierarchy and routes the request to that tenant. Null → no
// header → the backend uses the token's own tenant (single-tenant users).
//
// Persisted in sessionStorage so a page refresh keeps the operator in the
// same client instead of bouncing them back to the portfolio. Cleared on
// sign-out (setApiCacheSessionScope('signed-out') zeroes it below).
const ACTIVE_TENANT_STORAGE_KEY = "tr_active_tenant";
let activeTenantId = (() => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage?.getItem(ACTIVE_TENANT_STORAGE_KEY) || null;
  } catch {
    return null;
  }
})();

export function setActiveTenantId(id) {
  activeTenantId = id != null && String(id).trim() ? String(id).trim() : null;
  if (typeof window !== "undefined") {
    try {
      if (activeTenantId) {
        window.sessionStorage?.setItem(ACTIVE_TENANT_STORAGE_KEY, activeTenantId);
      } else {
        window.sessionStorage?.removeItem(ACTIVE_TENANT_STORAGE_KEY);
      }
    } catch {
      // best effort
    }
  }
}

export function getActiveTenantId() {
  return activeTenantId;
}

// Merge the X-Tenant-Id header into a base headers object when an active
// tenant is set. Used at every fetch call site.
function withTenantHeader(base) {
  if (!activeTenantId) return base;
  return { ...(base || {}), "X-Tenant-Id": activeTenantId };
}

export function setApiCacheSessionScope(scope) {
  const nextScope = normalizeSessionScope(scope);
  const previousScope = normalizeSessionScope(currentSessionScope);

  currentSessionScope = nextScope;
  authRedirectStarted = false;

  if (typeof window !== "undefined") {
    try {
      // localStorage to match readStoredSessionScope — see the note there:
      // a scope only remembered for the tab makes every new tab look like a
      // user switch and wipes the persisted caches on first bootstrap.
      window.localStorage?.setItem(SESSION_SCOPE_STORAGE_KEY, nextScope);
    } catch {
      // best effort
    }
  }

  if (nextScope !== previousScope) {
    clearApiCache();
    // A scope change means the identity changed (sign-in / sign-out /
    // user switch). The previously-selected client no longer applies —
    // clear it so we don't send a stale X-Tenant-Id under a new identity.
    setActiveTenantId(null);
    // Wipe every registered secondary cache (useCachedFetch) so no
    // previous-identity entry survives the switch.
    cacheClearListeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // A misbehaving listener must not block the scope change.
      }
    });
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

// Unlike emitAuthRequired, this has no "only once" latch — a permission
// denial is a per-action event (the operator might click three
// different gated buttons in a row, each deserves its own notice), not
// a session-wide state change like needing to log in again.
function emitPermissionDenied(err, { url } = {}) {
  if (typeof window === "undefined") return;

  const detail = {
    url,
    status: err?.status ?? 403,
    code: err?.code || err?.body?.error || "PERMISSION_DENIED",
    message: err?.body?.message || err?.message || "You don't have permission to do that.",
    ts: now(),
  };

  window.dispatchEvent(new CustomEvent(PERMISSION_DENIED_EVENT, { detail }));
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

// Two-tier entry engine shared with ../hooks/useCachedFetch (see entryCache.js).
// NOTE: read/write here receive an ALREADY-scoped key (buildCacheKey runs at
// the GET call site), so deriveKey is identity; invalidateApiCache builds the
// key itself before delegating.
const entryCache = createEntryCache({
  storagePrefix: STORAGE_PREFIX,
  unscopeKey: unscopedCacheKey,
});

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
  // CRITICAL: the cache key MUST include the active tenant. An MSP operator
  // switches the active tenant (X-Tenant-Id) without a new sign-in, and the
  // same URL returns DIFFERENT data per tenant. Keying only by session
  // scope + URL let one tenant's cached response be served for another
  // (a cross-tenant data leak in the UI). sessionStorage persistence made
  // it survive reloads too. Scoping by active tenant partitions the cache
  // so each tenant context has its own entries. `_` = no active tenant
  // (portfolio mode / single-tenant users → the token tenant).
  const tenant = activeTenantId || "_";
  return `${getApiCacheSessionScope()}::${tenant}::${rawKey}`;
}

// Recover the raw URL from a cache key of the form `scope::tenant::url`.
// Strips the first TWO `::`-delimited segments (scope + tenant); the URL
// itself never contains `::`.
function unscopedCacheKey(cacheKey) {
  const text = String(cacheKey || "");
  const first = text.indexOf("::");
  if (first < 0) return text;
  const second = text.indexOf("::", first + 2);
  return second >= 0 ? text.slice(second + 2) : text.slice(first + 2);
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
  return entryCache.read(cacheKey, options.storageMaxAgeMs);
}

function writeGetCache(cacheKey, data) {
  return entryCache.write(cacheKey, data);
}

export function invalidateApiCache(key) {
  if (!key) return;
  entryCache.invalidate(buildCacheKey(key));
}

export function invalidateApiCachePrefix(prefix) {
  if (!prefix) return;
  entryCache.invalidatePrefix(String(prefix));
}

/**
 * @param {{ keepInFlight?: boolean }} [opts]
 *
 * `keepInFlight` exists for the tenant switch. Dropping the in-flight map
 * there was costing a duplicated burst: `enterTenant` clears the cache,
 * the shell re-renders and fires Overview's ~14 requests, then the
 * un-awaited `refreshAuth()` lands, re-renders again, and the second wave
 * cannot reuse the first because the map it would have matched against is
 * gone. Measured on a real client switch: 28 requests where 21 were
 * distinct.
 *
 * Clearing it is unnecessary there anyway — buildCacheKey is scoped by
 * active tenant, so an in-flight entry from tenant A lives under a
 * different key than anything tenant B will ask for, and the cross-tenant
 * reuse the wipe was defending against cannot happen.
 *
 * After a MUTATION it still clears: a GET that left before the write
 * carries pre-write data, and letting a later caller adopt that in-flight
 * promise would serve them a stale answer.
 */
export function clearApiCache(opts = {}) {
  entryCache.clear();
  if (!opts.keepInFlight) inFlightGets.clear();
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

export function isPermissionDeniedError(err) {
  const code = String(err?.code || err?.body?.error || "").toUpperCase();
  return err?.status === 403 && code === "PERMISSION_DENIED";
}

// 5xx statuses that are PERMANENT, not transient. 501 Not Implemented is
// used deliberately by RCP "screen" (an unreleased feature) — retrying it
// will never succeed. 505 HTTP Version Not Supported is likewise a
// permanent protocol failure. Both must fall into permanent error handling
// (a plain Error carrying code/status, like the 4xx path) instead of
// TemporaryServerError / retryable degradation.
const PERMANENT_5XX_STATUSES = new Set([501, 505]);

export function isTemporaryApiError(err) {
  if (!err) return false;

  const message = String(err.message || "").toLowerCase();
  const code = String(err.code || err.body?.error || "").toUpperCase();

  if (PERMANENT_5XX_STATUSES.has(err.status)) return false;

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
    // A 204 (or any empty 2xx body) has nothing to parse, and res.json()
    // rejects on an empty stream. Without this, a successful DELETE — which
    // the gateway endpoints answer with 204 — surfaced to the caller as a
    // thrown SyntaxError and was reported to the operator as a failure.
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return null;
    }
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

  if (res.status === 403 && getBodyErrorCode(body) === "PERMISSION_DENIED") {
    const err = new PermissionDeniedError(body?.message, {
      status: 403,
      body,
      code: "PERMISSION_DENIED",
    });

    emitPermissionDenied(err, { url });
    throw err;
  }

  if (
    !PERMANENT_5XX_STATUSES.has(res.status) &&
    (res.status === 503 || isRetryableBody(body) || res.status >= 500)
  ) {
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

  // Already emitted inside handleResponse — pass through unchanged.
  // (AuthError re-emits here too because callers can also construct/throw
  // one directly without going through handleResponse; nothing else in
  // this codebase throws a PermissionDeniedError except handleResponse,
  // so there's no second emission site to cover here.)
  if (err instanceof PermissionDeniedError) {
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
      headers: withTenantHeader(),
      signal: timeout.signal,
    });

    return await handleResponse(res, url);
  } catch (err) {
    throw toHumanError(err, url);
  } finally {
    timeout.done();
  }
}

/**
 * GET de un cuerpo NDJSON, línea a línea.
 *
 * Existe aparte de httpGetJson porque una grabación de pantalla puede pesar
 * cientos de megas: parsearla como un único JSON obligaría a tenerla entera en
 * memoria dos veces —el texto y el objeto— y a esperar al último byte antes de
 * pintar el primer fotograma.
 *
 * `onLine` recibe cada objeto ya parseado, en ORDEN. El orden no es un detalle:
 * los fotogramas parciales se pintan encima del anterior, así que uno que se
 * adelante corrompe todo lo que viene detrás.
 *
 * Una línea que no parsea se ignora y se sigue: el backend escribe una por
 * fotograma y un corte a mitad de la última es el final normal de una
 * respuesta interrumpida, no un error que deba tirar lo ya recibido.
 */
export async function httpGetNdjson(url, onLine, options = {}) {
  const timeout = withTimeout(options.timeoutMs ?? 120000);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "GET",
      credentials: "include",
      headers: withTenantHeader(),
      signal: options.signal ?? timeout.signal,
    });
    if (!res.ok) {
      // Los errores de este endpoint vienen en JSON aunque la respuesta feliz
      // sea NDJSON; se deja que handleResponse los normalice como el resto.
      return await handleResponse(res, url);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("streaming no soportado por este navegador");

    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          onLine(JSON.parse(line));
        } catch {
          /* línea partida o corrupta: se ignora y se sigue */
        }
      }
    }
    const tail = buf.trim();
    if (tail) {
      try {
        onLine(JSON.parse(tail));
      } catch {
        /* última línea incompleta */
      }
    }
    return { ok: true };
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

/**
 * GET a binary/text response as a Blob (credentialed, tenant-header aware).
 * Used for authenticated file downloads (report PDF/CSV) where a plain
 * <a href> can't carry the session. Returns { blob, filename } — filename
 * parsed from Content-Disposition when present. Errors flow through the
 * same auth/temporary handling as JSON GETs.
 */
export async function httpGetBlob(url, options = {}) {
  const timeout = withTimeout(options.timeoutMs ?? 60_000);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "GET",
      credentials: "include",
      headers: withTenantHeader(),
      signal: timeout.signal,
    });
    if (!res.ok) {
      // Reuse the shared error mapping (throws AuthError / TemporaryServerError /
      // Error). handleResponse only reads the body on the error path here.
      await handleResponse(res, url);
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    const filename = match ? decodeURIComponent(match[1]) : null;
    return { blob, filename };
  } catch (err) {
    throw toHumanError(err, url);
  } finally {
    timeout.done();
  }
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
      headers: withTenantHeader({ "Content-Type": "application/json" }),
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

// Binary POST — sends a raw body (File / Blob / ArrayBuffer / Uint8Array) as
// application/octet-stream. Used by the SDP AI-intake upload, where the file's
// bytes are the body and the metadata rides in the query string. Mirrors
// httpPostJson's error/cache handling; the default timeout is generous because
// installer uploads can be large.
export async function httpPostBinary(
  url,
  bytes,
  { timeoutMs = 120_000, contentType = "application/octet-stream" } = {}
) {
  const timeout = withTimeout(timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "POST",
      credentials: "include",
      headers: withTenantHeader({ "Content-Type": contentType }),
      body: bytes,
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
      headers: withTenantHeader({ "Content-Type": "application/json", ...(headers || {}) }),
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

export async function httpPatchJson(url, body, { timeoutMs, headers } = {}) {
  const timeout = withTimeout(timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "PATCH",
      credentials: "include",
      // Optional extra headers (e.g. If-Match for the domain-scoped
      // policy saves) merge on top, same contract as httpPutJson.
      headers: withTenantHeader({ "Content-Type": "application/json", ...(headers || {}) }),
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
      headers: withTenantHeader(),
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
