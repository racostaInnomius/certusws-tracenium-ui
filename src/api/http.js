// src/api/http.js
//
// Tracenium HTTP helpers with a small enterprise-grade GET cache.
//
// Why this exists:
// - Many pages fetch dashboards, cards, charts, tables and settings on mount.
// - Without a shared cache, sidebar navigation can feel slow because every page
//   waits for the same GETs again.
// - This helper keeps a short-lived memory + sessionStorage cache for GETs,
//   deduplicates concurrent requests, and clears cached reads after mutations.
//
// Usage stays backward compatible:
//   httpGetJson('/api/v1/dashboard/summary')
//
// Optional controls:
//   httpGetJson(url, { cache: 'no-store' })  // always network
//   httpGetJson(url, { cache: 'reload' })    // network + update cache
//   httpGetJson(url, { staleMs: 120_000 })   // custom fresh window

const API_BASE = import.meta.env.VITE_API_BASE;

const DEFAULT_TIMEOUT_MS = 15_000;
const STORAGE_PREFIX = "tnm:http-cache:";

const DEFAULT_STALE_MS = 60_000;
const DEFAULT_STORAGE_MAX_AGE_MS = 10 * 60_000;

const memCache = new Map();
const inFlightGets = new Map();

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
  return String(url || "");
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
    if (String(key).startsWith(normalizedPrefix)) {
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
        key.slice(STORAGE_PREFIX.length).startsWith(normalizedPrefix)
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

async function fetchGetJson(url, options) {
  const timeout = withTimeout(options.timeoutMs);

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

    const json = await handleResponse(res);
    invalidateAfterMutation(url);
    return json;
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
      headers: { "Content-Type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });

    const json = await handleResponse(res);
    invalidateAfterMutation(url);
    return json;
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

    const json = await handleResponse(res);
    invalidateAfterMutation(url);
    return json;
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

    const json = await handleResponse(res);
    invalidateAfterMutation(url);
    return json;
  } catch (err) {
    throw toHumanError(err);
  } finally {
    timeout.done();
  }
}
