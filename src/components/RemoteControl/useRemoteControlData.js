// src/components/RemoteControl/useRemoteControlData.js
//
// One hook per dataset, with the cache key pinned in here.
//
// ── Why the single loader is split ───────────────────────────────────
//
// The page used to fetch all four datasets at once, in a Promise.allSettled
// stored under one key, "remoteControl:bundle". Mounting tabs on top of that
// would have saved nothing: rendering "Connect" would still pull the whole
// session history and the entire file-transfer log. The tabs would have been
// a change of appearance.
//
// Now each panel asks for its own data when it mounts (TabPanel unmounts the
// inactive panel, so "mounting" is literally "opening the tab"), and
// useCachedFetch serves from cache on the way back.
//
// ── Why the keys live here and not in each caller ────────────────────
//
// The device list is used by TWO places: the table in the Connect tab and
// step 2 of the wizard. With the key written at each call site, one typo in
// either string would give two parallel caches and two requests for the same
// list, with no visible symptom other than the traffic. Pinned here, both
// callers share the entry and useCachedFetch dedupes the in-flight request.

import { useCallback } from "react";
import { useCachedFetch } from "../../hooks/useCachedFetch";
import { RCP_METHODS, canStart } from "./rcpMethods";
import {
  getRemoteControlSummary,
  getConnectableDevices,
  getDeviceFacets,
  getRemoteSessions,
  getAllFileTransfers
} from "../../api/remoteControl";

/**
 * One page of connectable devices, filtered server-side.
 *
 * ── The cache key carries the filters ────────────────────────────────
 *
 * Every distinct filter combination is its own cache entry, so paging back
 * to a page you already visited is instant and changing a filter is a fresh
 * request. Leaving the filters out of the key would serve page 1's rows
 * under page 2's heading — the classic paginated-cache bug, and a silent one
 * because the rows still look like devices.
 *
 * `complete` says whether what came back is the WHOLE filtered set rather
 * than a slice. It exists for one caller — the KPI fallback — which must
 * never count a page and call it the fleet. An older backend that ignores
 * these parameters returns everything and no `total`, and that case reads as
 * complete, which is exactly right.
 */
export function useConnectableDevices(filters = {}) {
  const {
    page = 1,
    pageSize = 25,
    search = "",
    capability = null,
    rcpOnly = false,
    onlineOnly = false,
    groupId = null,
    platform = null,
    // Hooks can't be called conditionally, so a caller that only sometimes
    // needs a list says so here instead. The loader short-circuits without
    // touching the network — the alternative was a wasted page of devices
    // every time the wizard opened.
    skip = false
  } = filters;

  const loader = useCallback(async () => {
    if (skip) return { items: [], total: 0 };
    const res = await getConnectableDevices({
      page,
      pageSize,
      search: search || undefined,
      capability: capability || undefined,
      rcpOnly: rcpOnly ? "true" : undefined,
      onlineOnly: onlineOnly ? "true" : undefined,
      groupId: groupId ?? undefined,
      platform: platform || undefined
    });
    const items = Array.isArray(res?.items) ? res.items : [];
    return {
      items,
      // An old backend sends neither `total` nor `page`; falling back to the
      // row count keeps the pager honest instead of showing "of NaN".
      total: Number.isFinite(Number(res?.total)) ? Number(res.total) : items.length
    };
  }, [skip, page, pageSize, search, capability, rcpOnly, onlineOnly, groupId, platform]);

  const key = [
    "remoteControl:devices",
    page,
    pageSize,
    search,
    capability ?? "",
    rcpOnly ? 1 : 0,
    onlineOnly ? 1 : 0,
    groupId ?? "",
    platform ?? "",
    skip ? "skip" : ""
  ].join(":");

  const state = useCachedFetch(key, loader);
  const items = state.data?.items ?? [];
  const total = state.data?.total ?? 0;
  return { ...state, devices: items, total, complete: items.length >= total };
}

/**
 * How many devices can serve each method right now — the counts under the
 * wizard's three cards.
 *
 * Three requests of ONE row each: the answer wanted is the `total`, not the
 * devices, so this asks for the smallest page the endpoint will give and
 * reads the count off it. Fetching the fleet to call `.length` on it is what
 * this whole phase exists to stop.
 *
 * ⚠️ An older backend ignores `pageSize` and sends everything with no
 * `total`. Trusting `items.length` there would report the whole fleet as
 * "ready" for every method, so that case falls back to counting the returned
 * rows with the same predicate the buttons use.
 */
export function useMethodCounts(enabled = true) {
  const loader = useCallback(async () => {
    if (!enabled) return {};
    const entries = await Promise.all(
      RCP_METHODS.map(async (method) => {
        const res = await getConnectableDevices({
          page: 1,
          pageSize: 1,
          capability: method.capability,
          onlineOnly: "true"
        });
        if (Number.isFinite(Number(res?.total))) return [method.type, Number(res.total)];
        const items = Array.isArray(res?.items) ? res.items : [];
        return [method.type, items.filter((d) => canStart(d, method.type)).length];
      })
    );
    return Object.fromEntries(entries);
  }, [enabled]);

  const state = useCachedFetch(`remoteControl:methodCounts:${enabled ? 1 : 0}`, loader);
  return state.data ?? {};
}

/** Group and platform options for the filter dropdowns. */
export function useDeviceFacets() {
  const loader = useCallback(async () => {
    const res = await getDeviceFacets();
    return {
      groups: Array.isArray(res?.groups) ? res.groups : [],
      platforms: Array.isArray(res?.platforms) ? res.platforms : []
    };
  }, []);

  const state = useCachedFetch("remoteControl:facets", loader);
  return {
    ...state,
    groups: state.data?.groups ?? [],
    platforms: state.data?.platforms ?? []
  };
}

/** Tenant-wide aggregates: active sessions, last 7 days, average duration. */
export function useRemoteControlSummary() {
  const loader = useCallback(async () => {
    const res = await getRemoteControlSummary();
    return res?.summary ?? null;
  }, []);

  const state = useCachedFetch("remoteControl:summary", loader);
  return { ...state, summary: state.data ?? null };
}

/**
 * Session history.
 *
 * ⚠️ `limit: 50` is not a preference, it is the ceiling of what the endpoint
 * can give: it accepts `limit` (max 200) and `deviceId`, and nothing else —
 * no offset, no status, no date range. Past that the history stops existing
 * for the UI WITHOUT saying so, which is what phase 4 fixes. Until then the
 * table shows `total` next to the row count so the gap is visible rather
 * than hidden.
 */
export function useRemoteSessions(limit = 50) {
  const loader = useCallback(async () => {
    const res = await getRemoteSessions({ limit });
    return {
      items: Array.isArray(res?.items) ? res.items : [],
      total: Number(res?.total ?? 0)
    };
  }, [limit]);

  const state = useCachedFetch(`remoteControl:sessions:${limit}`, loader);
  return {
    ...state,
    sessions: state.data?.items ?? [],
    total: state.data?.total ?? 0
  };
}

/** Tenant-wide file transfer audit log. */
export function useFileTransfers(limit = 200) {
  const loader = useCallback(async () => {
    const res = await getAllFileTransfers({ limit });
    return {
      items: Array.isArray(res?.items) ? res.items : [],
      total: Number(res?.total ?? 0)
    };
  }, [limit]);

  const state = useCachedFetch(`remoteControl:transfers:${limit}`, loader);
  return {
    ...state,
    transfers: state.data?.items ?? [],
    total: state.data?.total ?? 0
  };
}
