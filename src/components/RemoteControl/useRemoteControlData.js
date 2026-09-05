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
 * Session history — one page, filtered server-side.
 *
 * It used to ask for `limit: 50` and stop there, because that was the whole
 * of what the endpoint could do: no offset, no status, no date range. Past
 * the newest 200 rows the history did not exist for this page and nothing
 * said so.
 */
export function useRemoteSessions(filters = {}) {
  const {
    page = 1,
    pageSize = 25,
    status = null,
    type = null,
    operator = "",
    from = null,
    to = null,
    hasRecording = false
  } = filters;

  const loader = useCallback(async () => {
    const res = await getRemoteSessions({
      page,
      pageSize,
      status: status || undefined,
      type: type || undefined,
      operator: operator || undefined,
      from: from || undefined,
      to: to || undefined,
      hasRecording: hasRecording ? "true" : undefined
    });
    const items = Array.isArray(res?.items) ? res.items : [];
    return {
      items,
      total: Number.isFinite(Number(res?.total)) ? Number(res.total) : items.length
    };
  }, [page, pageSize, status, type, operator, from, to, hasRecording]);

  const key = [
    "remoteControl:sessions",
    page,
    pageSize,
    status ?? "",
    type ?? "",
    operator,
    from ?? "",
    to ?? "",
    hasRecording ? 1 : 0
  ].join(":");

  const state = useCachedFetch(key, loader);
  return {
    ...state,
    sessions: state.data?.items ?? [],
    total: state.data?.total ?? 0
  };
}

/**
 * Tenant-wide file transfer audit log — one page.
 *
 * ⚠️ direction/status/filename van a la PETICIÓN. La tabla los aplicaba en
 * cliente sobre la página cargada, así que "failed" solo encontraba fallos
 * entre las 25 filas más recientes y una tabla vacía significaba "no hay en
 * esta página", no "no hay". El endpoint los acepta desde M2.S2.
 *
 * "all" y "" son ausencia de filtro y no se mandan: el backend valida
 * `status` contra una lista y descartaría "all" en silencio, pero mandarlo
 * ensuciaría la clave de caché con un valor que no significa nada.
 */
export function useFileTransfers(filters = {}) {
  const {
    page = 1,
    pageSize = 25,
    direction = "all",
    status = "all",
    filename = ""
  } = filters;

  const dir = direction && direction !== "all" ? direction : null;
  const st = status && status !== "all" ? status : null;
  const name = String(filename || "").trim() || null;

  const loader = useCallback(async () => {
    const res = await getAllFileTransfers({
      page,
      pageSize,
      ...(dir ? { direction: dir } : {}),
      ...(st ? { status: st } : {}),
      ...(name ? { filename: name } : {})
    });
    const items = Array.isArray(res?.items) ? res.items : [];
    return {
      items,
      total: Number.isFinite(Number(res?.total)) ? Number(res.total) : items.length
    };
  }, [page, pageSize, dir, st, name]);

  const state = useCachedFetch(
    `remoteControl:transfers:${page}:${pageSize}:${dir ?? ""}:${st ?? ""}:${name ?? ""}`,
    loader
  );
  return {
    ...state,
    transfers: state.data?.items ?? [],
    total: state.data?.total ?? 0
  };
}
