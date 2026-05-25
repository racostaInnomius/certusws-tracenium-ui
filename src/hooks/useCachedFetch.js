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
import { isAuthError, isTemporaryApiError, TEMPORARY_ERROR_EVENT } from "../api/http";

const memCache = new Map();
const inFlight = new Map();

const STORAGE_PREFIX = "tnm:cache:";

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

function getStorageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function isEntryExpired(entry, storageMaxAgeMs) {
  if (!entry || !entry.ts) return true;
  return now() - Number(entry.ts) > storageMaxAgeMs;
}

function readCache(key, options = {}) {
  const storageMaxAgeMs =
    Number(options.storageMaxAgeMs ?? DEFAULT_STORAGE_MAX_AGE_MS) ||
    DEFAULT_STORAGE_MAX_AGE_MS;

  if (memCache.has(key)) {
    const entry = memCache.get(key);

    if (!isEntryExpired(entry, storageMaxAgeMs)) {
      return entry;
    }

    memCache.delete(key);
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage?.getItem(getStorageKey(key));
    if (!raw) return null;

    const parsed = safeJsonParse(raw);
    if (!parsed || isEntryExpired(parsed, storageMaxAgeMs)) {
      window.sessionStorage?.removeItem(getStorageKey(key));
      return null;
    }

    memCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  const entry = {
    data,
    ts: now(),
  };

  memCache.set(key, entry);

  if (typeof window === "undefined") return entry;

  try {
    window.sessionStorage?.setItem(getStorageKey(key), JSON.stringify(entry));
  } catch {
    // Non-fatal. Some responses may be too large or not serializable.
    // The in-memory cache still works for the current session.
  }

  return entry;
}

export function invalidateCache(key) {
  if (!key) return;

  memCache.delete(key);

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage?.removeItem(getStorageKey(key));
  } catch {
    // best effort
  }
}

export function invalidateCachePrefix(prefix) {
  if (!prefix) return;

  Array.from(memCache.keys()).forEach((key) => {
    if (String(key).startsWith(prefix)) {
      memCache.delete(key);
    }
  });

  if (typeof window === "undefined") return;

  try {
    const keysToRemove = [];

    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const storageKey = window.sessionStorage.key(i);

      if (
        storageKey &&
        storageKey.startsWith(STORAGE_PREFIX) &&
        storageKey.slice(STORAGE_PREFIX.length).startsWith(prefix)
      ) {
        keysToRemove.push(storageKey);
      }
    }

    keysToRemove.forEach((storageKey) => {
      window.sessionStorage.removeItem(storageKey);
    });
  } catch {
    // best effort
  }
}

export function clearCachedFetch() {
  memCache.clear();

  if (typeof window === "undefined") return;

  try {
    const keysToRemove = [];

    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const storageKey = window.sessionStorage.key(i);

      if (storageKey && storageKey.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(storageKey);
      }
    }

    keysToRemove.forEach((storageKey) => {
      window.sessionStorage.removeItem(storageKey);
    });
  } catch {
    // best effort
  }
}

export async function prefetchCachedFetch(cacheKey, loader) {
  if (!cacheKey || typeof loader !== "function") return null;

  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey);
  }

  const promise = Promise.resolve()
    .then(() => loader())
    .then((fresh) => {
      writeCache(cacheKey, fresh);
      return fresh;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, promise);

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
        let promise = inFlight.get(cacheKey);

        if (!promise) {
          promise = Promise.resolve()
            .then(() => loaderRef.current({ reason }))
            .then((fresh) => {
              writeCache(cacheKey, fresh);
              return fresh;
            })
            .finally(() => {
              inFlight.delete(cacheKey);
            });

          inFlight.set(cacheKey, promise);
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
