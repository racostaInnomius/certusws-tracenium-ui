// src/hooks/useCachedFetch.js
//
// Stale-while-revalidate fetch hook. Pages that consume it stop
// flashing blank when the user navigates between sidebar entries —
// the last-known data is shown immediately and a quiet refetch runs
// in the background.
//
// Two cache layers, both keyed by the caller-supplied `cacheKey`:
//
//   1. Module-scope `Map` — survives in-app navigation. This is the
//      common case: switching between sidebar entries within a single
//      session. Hydration is synchronous so the page never blanks.
//
//   2. `sessionStorage` snapshot — survives full reloads (F5, close
//      and reopen tab). Best-effort: serialization or quota errors are
//      swallowed; the in-memory cache still works without it.
//
// Returned shape:
//   data            — last known value (cache or fresh).
//   loading         — true ONLY when there's no cache yet. Pages should
//                     render their skeleton/empty-state on `loading`,
//                     but skip it on `refreshing` (we already have data
//                     to paint).
//   refreshing      — a quiet refetch is in flight; show a small spinner
//                     on the manual Refresh button, not a full skeleton.
//   error           — last fetch error, if any.
//   refetch()       — manual refresh (the page's "Refresh" button calls
//                     this; useAutoRefresh also calls it on its tick).
//   lastUpdatedAt   — epoch ms of the last successful write to cache.
//
// Constraints on `loader`:
//   - Must return a JSON-serializable value if you want sessionStorage
//     persistence to work. Maps/Sets/Class instances won't survive a
//     reload.
//   - Loader identity is captured by ref, so callers can pass a fresh
//     closure every render without retriggering the effect.

import { useCallback, useEffect, useRef, useState } from "react";

const memCache = new Map();
const STORAGE_PREFIX = "tnm:cache:";

function readCache(key) {
  if (memCache.has(key)) return memCache.get(key);
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    memCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  const entry = { data, ts: Date.now() };
  memCache.set(key, entry);
  try {
    window.sessionStorage?.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* serialization or quota errors are non-fatal — in-memory cache is
       still authoritative for this session. */
  }
}

/**
 * Drop the cache for a key. Useful after mutations where the cached
 * read is known to be stale (e.g. after a successful POST that the
 * loader's GET would now reflect).
 */
export function invalidateCache(key) {
  memCache.delete(key);
  try {
    window.sessionStorage?.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* best effort */
  }
}

export function useCachedFetch(cacheKey, loader) {
  const initial = readCache(cacheKey);

  const [data, setData] = useState(initial?.data ?? null);
  const [loading, setLoading] = useState(initial == null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(initial?.ts ?? null);

  // Capture loader by ref so callers passing a fresh closure each
  // render don't accidentally retrigger the effect below. The effect
  // depends only on the cache key.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // Track mount state so we don't set state after a fast unmount
  // (e.g. user clicks away mid-fetch). Avoids the React "memory leak"
  // warning and prevents stale results landing on a different page.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const hadCache = memCache.has(cacheKey);
    if (hadCache) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const fresh = await loaderRef.current();
      writeCache(cacheKey, fresh);
      if (mountedRef.current) {
        setData(fresh);
        setLastUpdatedAt(Date.now());
      }
    } catch (e) {
      if (mountedRef.current) setError(e);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [cacheKey]);

  // Initial load. The cache key is the only dependency — switching the
  // key (rare in practice) triggers a fresh hydration + fetch cycle.
  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, refreshing, error, refetch, lastUpdatedAt };
}
