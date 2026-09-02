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
import {
  getRemoteControlSummary,
  getConnectableDevices,
  getRemoteSessions,
  getAllFileTransfers
} from "../../api/remoteControl";

/**
 * The devices a session can be opened against.
 *
 * ⚠️ `/devices` currently returns the whole fleet unpaginated and all the
 * filtering happens in the browser. That's acceptable at today's scale and
 * it's what lets phase 1 ship without touching the backend, but it is this
 * screen's known ceiling: phase 3 moves to server-side `page`/`pageSize`/
 * `search` and this hook changes shape. Callers already work off `devices`,
 * which is the shape that survives that change.
 */
export function useConnectableDevices() {
  const loader = useCallback(async () => {
    const res = await getConnectableDevices();
    return Array.isArray(res?.items) ? res.items : [];
  }, []);

  const state = useCachedFetch("remoteControl:devices", loader);
  return { ...state, devices: state.data ?? [] };
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
