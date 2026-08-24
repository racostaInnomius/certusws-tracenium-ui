// src/hooks/useCachedFetch.js
//
// Enterprise stale-while-revalidate fetch hook for Tracenium.
//
// Goal:
// - Avoid blank screens when navigating between pages.
// - Show last-known data immediately when available.
// - Refresh quietly in the background when cache is stale.
// - Avoid duplicated requests for the same cache key.
// - Preserve previous data when a refresh fails with a temporary backend/DB/network error.
// - Keep compatibility with existing usage:
//
//   useCachedFetch(cacheKey, loader)
//
// Advanced usage:
//
//   useCachedFetch(cacheKey, loader, {
//     staleMs: 60_000,
//     storageMaxAgeMs: 10 * 60_000,
//     revalidateOnMount: "stale",
//   })
//
// Returned shape:
// - data
// - loading
// - refreshing
// - error
// - temporaryError
// - refetch
// - lastUpdatedAt
// - cacheAgeMs
// - isStale
// - hasCache

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isAuthError,
  isTemporaryApiError,
  TEMPORARY_ERROR_EVENT,
  getActiveTenantId,
  getApiCacheSessionScope,
  setApiCacheSessionScope,
  registerCacheClearListener,
} from "../api/http";

const inFlight = new Map();

import { createEntryCache } from "../api/entryCache";

const STORAGE_PREFIX = "tnm:cache:";

// Session scope + active tenant are OWNED by ../api/http (the single source of
// truth). This cache keys by that same scope/tenant, so an identity change
// makes old-scope entries unreachable automatically; http.js also fires our
// registered clearer (see bottom of file) to actually free them. These two
// helpers stay exported for backward compatibility but now delegate to the
// owner — there is no second session-scope state to keep in sync.
export function getCachedFetchSessionScope() {
  return getApiCacheSessionScope();
}

export function setCachedFetchSessionScope(scope) {
  return setApiCacheSessionScope(scope);
}

function buildScopedCacheKey(key) {
  // Scope by session + ACTIVE TENANT (both from ../api/http). Without the
  // tenant in the key, an MSP tenant switch would serve one tenant's cached
  // data to another. `_` = no active tenant (portfolio / single-tenant).
  const tenant = getActiveTenantId() || "_";
  return `${getApiCacheSessionScope()}::${tenant}::${String(key || "")}`;
}

// Recover the raw key from `scope::tenant::key` — strip the first two
// `::`-delimited segments (scope + tenant).
function unscopedCacheKey(key) {
  const text = String(key || "");
  const first = text.indexOf("::");
  if (first < 0) return text;
  const second = text.indexOf("::", first + 2);
  return second >= 0 ? text.slice(second + 2) : text.slice(first + 2);
}

const DEFAULT_STALE_MS = 60_000;
const DEFAULT_STORAGE_MAX_AGE_MS = 10 * 60_000;

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

// Two-tier entry engine shared with ../api/http (see api/entryCache.js).
// Scoping happens here: every key becomes `session::tenant::key`.
const entryCache = createEntryCache({
  storagePrefix: STORAGE_PREFIX,
  deriveKey: buildScopedCacheKey,
  unscopeKey: unscopedCacheKey,
  // localStorage, not sessionStorage: this cache exists so a returning
  // operator sees their dashboard immediately instead of an empty page and a
  // spinner. sessionStorage dies with the tab, so it could never serve that
  // case — every first visit after closing the browser was a cold start, no
  // matter how long the entries were allowed to live.
  //
  // Safe because the keys here are `sessionScope::tenant::key`, where the
  // scope is the signed-in subject+email: a different principal on the same
  // browser reads a different namespace, never these entries. performLogout()
  // clears the cache outright, and every read still enforces the caller's
  // storageMaxAgeMs, so nothing is served past its own freshness budget.
  persistence: "local",
});

const memCache = entryCache.memCache;

function readCache(key, options = {}) {
  const storageMaxAgeMs =
    Number(options.storageMaxAgeMs ?? DEFAULT_STORAGE_MAX_AGE_MS) ||
    DEFAULT_STORAGE_MAX_AGE_MS;
  return entryCache.read(key, storageMaxAgeMs);
}

function writeCache(key, data) {
  return entryCache.write(key, data);
}

export function invalidateCache(key) {
  entryCache.invalidate(key);
}

export function invalidateCachePrefix(prefix) {
  entryCache.invalidatePrefix(prefix);
}

export function clearCachedFetch() {
  entryCache.clear();
  inFlight.clear();
}

// Wipe this cache whenever http.js flips the session scope (identity change),
// so a single setApiCacheSessionScope() call clears BOTH caches. Registered on
// module load — before that this cache is empty, so nothing is missed.
registerCacheClearListener(clearCachedFetch);

export async function prefetchCachedFetch(cacheKey, loader) {
  if (!cacheKey || typeof loader !== "function") return null;

  const scopedInFlightKey = buildScopedCacheKey(cacheKey);

  if (inFlight.has(scopedInFlightKey)) {
    return inFlight.get(scopedInFlightKey);
  }

  const promise = Promise.resolve()
    .then(() => loader())
    .then((fresh) => {
      writeCache(cacheKey, fresh);
      return fresh;
    })
    .finally(() => {
      inFlight.delete(scopedInFlightKey);
    });

  inFlight.set(scopedInFlightKey, promise);

  return promise;
}

function normalizeOptions(options = {}) {
  return {
    staleMs:
      Number(options.staleMs ?? DEFAULT_STALE_MS) ||
      DEFAULT_STALE_MS,

    storageMaxAgeMs:
      Number(options.storageMaxAgeMs ?? DEFAULT_STORAGE_MAX_AGE_MS) ||
      DEFAULT_STORAGE_MAX_AGE_MS,

    // "always"  -> always fetch on mount, even with fresh cache.
    // "stale"   -> fetch only if there is no cache or cache is stale.
    // "never"   -> never auto-fetch on mount if cache exists.
    revalidateOnMount: options.revalidateOnMount || "stale",

    enabled: options.enabled !== false,
  };
}

function emitTemporaryWarning(error, cacheKey) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(TEMPORARY_ERROR_EVENT, {
      detail: {
        cacheKey,
        message: "Unable to refresh data. Showing last available data.",
        originalMessage: error?.body?.message || error?.message || "Temporary server error",
        status: error?.status ?? null,
        code: error?.code || error?.body?.error || "TEMPORARY_SERVER_ERROR",
        retryable: true,
        ts: now(),
      },
    })
  );
}

export function useCachedFetch(cacheKey, loader, options = {}) {
  const normalizedOptions = useMemo(
    () => normalizeOptions(options),
    [
      options.staleMs,
      options.storageMaxAgeMs,
      options.revalidateOnMount,
      options.enabled,
    ]
  );

  const initial = useMemo(
    () => readCache(cacheKey, normalizedOptions),
    [cacheKey, normalizedOptions.storageMaxAgeMs]
  );

  const [data, setData] = useState(initial?.data ?? null);
  const [loading, setLoading] = useState(
    normalizedOptions.enabled && initial == null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [temporaryError, setTemporaryError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(initial?.ts ?? null);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const nextInitial = readCache(cacheKey, normalizedOptions);

    setData(nextInitial?.data ?? null);
    setLastUpdatedAt(nextInitial?.ts ?? null);
    setLoading(normalizedOptions.enabled && nextInitial == null);
    setRefreshing(false);
    setError(null);
    setTemporaryError(null);
  }, [cacheKey, normalizedOptions.storageMaxAgeMs, normalizedOptions.enabled]);

  const hasCache = data !== null && data !== undefined;

  const cacheAgeMs =
    lastUpdatedAt == null ? null : Math.max(0, now() - Number(lastUpdatedAt));

  const isStale =
    cacheAgeMs == null ? true : cacheAgeMs > normalizedOptions.staleMs;

  const refetch = useCallback(
    async (reason = "manual") => {
      if (!normalizedOptions.enabled) return null;

      const cacheEntry = readCache(cacheKey, normalizedOptions);
      const hadCache = cacheEntry != null;

      if (hadCache) {
        if (mountedRef.current) setRefreshing(true);
      } else if (mountedRef.current) {
        setLoading(true);
      }

      if (mountedRef.current) {
        setError(null);
        setTemporaryError(null);
      }

      try {
        const scopedInFlightKey = buildScopedCacheKey(cacheKey);
        let promise = inFlight.get(scopedInFlightKey);

        if (!promise) {
          promise = Promise.resolve()
            .then(() => loaderRef.current({ reason }))
            .then((fresh) => {
              writeCache(cacheKey, fresh);
              return fresh;
            })
            .finally(() => {
              inFlight.delete(scopedInFlightKey);
            });

          inFlight.set(scopedInFlightKey, promise);
        }

        const fresh = await promise;

        if (mountedRef.current) {
          setData(fresh);
          setLastUpdatedAt(now());
        }

        return fresh;
      } catch (e) {
        // 401 is not a refresh problem and must never be downgraded to stale data.
        // http.js already emits the global auth-required event and has a redirect
        // fallback. Keep existing data untouched while the shell redirects.
        if (isAuthError(e)) {
          if (mountedRef.current) {
            setError(e);
            setTemporaryError(null);
          }
          return null;
        }

        const temp = isTemporaryApiError(e);
        const fallbackEntry = readCache(cacheKey, normalizedOptions);

        if (temp && fallbackEntry) {
          emitTemporaryWarning(e, cacheKey);

          if (mountedRef.current) {
            setData(fallbackEntry.data);
            setLastUpdatedAt(fallbackEntry.ts);
            setTemporaryError(e);
            setError(null);
          }

          return fallbackEntry.data;
        }

        if (mountedRef.current) {
          if (temp) {
            setTemporaryError(e);
            emitTemporaryWarning(e, cacheKey);
          } else {
            setError(e);
          }
        }

        return null;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      cacheKey,
      normalizedOptions.enabled,
      normalizedOptions.staleMs,
      normalizedOptions.storageMaxAgeMs,
      normalizedOptions.revalidateOnMount,
    ]
  );

  useEffect(() => {
    if (!normalizedOptions.enabled) return;

    const entry = readCache(cacheKey, normalizedOptions);
    const hasEntry = entry != null;
    const ageMs = hasEntry ? now() - Number(entry.ts) : null;
    const entryIsStale =
      ageMs == null ? true : ageMs > normalizedOptions.staleMs;

    if (hasEntry) {
      setData(entry.data);
      setLastUpdatedAt(entry.ts);
      setLoading(false);
    }

    const mode = normalizedOptions.revalidateOnMount;

    if (mode === "never" && hasEntry) return;
    if (mode === "stale" && hasEntry && !entryIsStale) return;

    refetch(hasEntry ? "stale-revalidate" : "initial-load");
  }, [
    cacheKey,
    normalizedOptions.enabled,
    normalizedOptions.staleMs,
    normalizedOptions.storageMaxAgeMs,
    normalizedOptions.revalidateOnMount,
    refetch,
  ]);

  return {
    data,
    loading,
    refreshing,
    error,
    temporaryError,
    refetch,
    lastUpdatedAt,
    cacheAgeMs,
    isStale,
    hasCache,
  };
}

export default useCachedFetch;
