// Characterization tests for useCachedFetch's cache ENTRY logic.
//
// Why this file exists: http.js has 11 tests covering its own GET cache
// (fresh-entry serving, invalidation, tenant partitioning, storage clearing),
// but the parallel cache inside useCachedFetch had none — only its session-scope
// delegation was tested. That asymmetry made the two implementations unsafe to
// touch: a regression on this side would go unnoticed.
//
// These pin the observable contract through the module's public API
// (prefetchCachedFetch writes; invalidateCache / invalidateCachePrefix /
// clearCachedFetch remove) plus the localStorage layout, so the entry logic
// can be refactored — or shared with http.js — with a real safety net.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  prefetchCachedFetch,
  invalidateCache,
  invalidateCachePrefix,
  clearCachedFetch,
} from "./useCachedFetch";
import { setApiCacheSessionScope, setActiveTenantId } from "../api/http";

const STORAGE_PREFIX = "tnm:cache:";

/** Every localStorage key this cache owns. */
function cacheKeys() {
  return Object.keys(window.localStorage).filter((k) => k.startsWith(STORAGE_PREFIX));
}

/** The parsed entry whose scoped key ends with `::<key>`. */
function storedEntryFor(key) {
  const match = cacheKeys().find((k) => k.endsWith(`::${key}`));
  return match ? JSON.parse(window.localStorage.getItem(match)) : null;
}

beforeEach(() => {
  window.localStorage.clear();
  clearCachedFetch();
  setApiCacheSessionScope("user-a");
  setActiveTenantId(null);
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  clearCachedFetch();
});

describe("write path", () => {
  it("persists the loader result to localStorage as {data, ts}", async () => {
    await prefetchCachedFetch("widgets", async () => ({ n: 1 }));

    const entry = storedEntryFor("widgets");
    expect(entry).not.toBeNull();
    expect(entry.data).toEqual({ n: 1 });
    expect(typeof entry.ts).toBe("number");
  });

  it("writes nothing when the loader rejects, and propagates the rejection", async () => {
    // prefetchCachedFetch has no .catch — the caller owns the failure. The
    // write only happens in the fulfilled branch, so nothing is cached.
    await expect(
      prefetchCachedFetch("boom", async () => {
        throw new Error("nope");
      })
    ).rejects.toThrow("nope");

    expect(storedEntryFor("boom")).toBeNull();
  });
});

describe("cache key scoping", () => {
  it("keys entries by session scope so a different identity cannot read them", async () => {
    await prefetchCachedFetch("shared", async () => "from-a");
    const keyAsUserA = cacheKeys().find((k) => k.endsWith("::shared"));
    expect(keyAsUserA).toContain("user-a");

    // A scope change makes the previous entry unreachable under the new key.
    setApiCacheSessionScope("user-b");
    await prefetchCachedFetch("shared", async () => "from-b");
    const keyAsUserB = cacheKeys().find(
      (k) => k.endsWith("::shared") && k.includes("user-b")
    );
    expect(keyAsUserB).toBeTruthy();
    expect(keyAsUserB).not.toBe(keyAsUserA);
  });

  it("partitions by ACTIVE TENANT — the cross-tenant leak guard", async () => {
    setActiveTenantId("tenant-1");
    await prefetchCachedFetch("devices", async () => ["t1-device"]);
    const t1Key = cacheKeys().find((k) => k.endsWith("::devices"));

    setActiveTenantId("tenant-2");
    await prefetchCachedFetch("devices", async () => ["t2-device"]);
    const t2Key = cacheKeys().find(
      (k) => k.endsWith("::devices") && k !== t1Key
    );

    expect(t1Key).toContain("tenant-1");
    expect(t2Key).toContain("tenant-2");
    // Two distinct entries — tenant-2 never reads tenant-1's payload.
    expect(JSON.parse(window.localStorage.getItem(t1Key)).data).toEqual(["t1-device"]);
    expect(JSON.parse(window.localStorage.getItem(t2Key)).data).toEqual(["t2-device"]);
  });

  it("uses '_' for the tenant segment when no tenant is active", async () => {
    setActiveTenantId(null);
    await prefetchCachedFetch("global", async () => 1);
    expect(cacheKeys().find((k) => k.endsWith("::global"))).toContain("::_::");
  });
});

describe("invalidation", () => {
  it("invalidateCache drops exactly one entry", async () => {
    await prefetchCachedFetch("keep", async () => 1);
    await prefetchCachedFetch("drop", async () => 2);

    invalidateCache("drop");

    expect(storedEntryFor("drop")).toBeNull();
    expect(storedEntryFor("keep")).not.toBeNull();
  });

  it("invalidateCachePrefix drops every entry under the prefix and keeps the rest", async () => {
    await prefetchCachedFetch("jobs:list", async () => 1);
    await prefetchCachedFetch("jobs:meta", async () => 2);
    await prefetchCachedFetch("pki:list", async () => 3);

    invalidateCachePrefix("jobs:");

    expect(storedEntryFor("jobs:list")).toBeNull();
    expect(storedEntryFor("jobs:meta")).toBeNull();
    expect(storedEntryFor("pki:list")).not.toBeNull();
  });

  it("clearCachedFetch wipes every entry this cache owns", async () => {
    await prefetchCachedFetch("a", async () => 1);
    await prefetchCachedFetch("b", async () => 2);

    clearCachedFetch();

    expect(cacheKeys()).toHaveLength(0);
  });
});

describe("expiry on read", () => {
  it("an entry older than storageMaxAgeMs is evicted from localStorage", async () => {
    await prefetchCachedFetch("stale-me", async () => "old");
    const key = cacheKeys().find((k) => k.endsWith("::stale-me"));

    // Backdate the stored entry well past any sane max-age.
    const entry = JSON.parse(window.localStorage.getItem(key));
    entry.ts = Date.now() - 24 * 60 * 60 * 1000; // 24h ago
    window.localStorage.setItem(key, JSON.stringify(entry));
    // Drop the in-memory copy so the next read has to go to storage.
    clearCachedFetch();
    window.localStorage.setItem(key, JSON.stringify(entry));

    // Re-prefetching overwrites with a fresh timestamp rather than serving
    // the expired payload.
    await prefetchCachedFetch("stale-me", async () => "new");
    expect(storedEntryFor("stale-me").data).toBe("new");
    expect(Date.now() - storedEntryFor("stale-me").ts).toBeLessThan(5_000);
  });

  it("tolerates a corrupt stored entry without throwing", async () => {
    await prefetchCachedFetch("corrupt", async () => "ok");
    const key = cacheKeys().find((k) => k.endsWith("::corrupt"));
    window.localStorage.setItem(key, "{not json");
    clearCachedFetch();
    window.localStorage.setItem(key, "{not json");

    await expect(
      prefetchCachedFetch("corrupt", async () => "recovered")
    ).resolves.not.toThrow();
    expect(storedEntryFor("corrupt").data).toBe("recovered");
  });
});

describe("survives the tab closing — the point of the cache", () => {
  it("writes to localStorage and NOT to sessionStorage", async () => {
    // The regression this guards: entries used to live in sessionStorage,
    // which the browser drops when the tab closes. That made the cache
    // worthless for the case it exists to serve — the operator who signs in
    // the next morning and stares at an empty dashboard while ~28 requests
    // resolve. sessionStorage could never serve that no matter how long
    // storageMaxAgeMs allowed entries to live.
    //
    // Asserting the ABSENCE from sessionStorage matters as much as the
    // presence in localStorage: flipping the backing store back would still
    // pass every other test in this file.
    await prefetchCachedFetch("fleet", async () => ["device-1"]);

    expect(storedEntryFor("fleet")?.data).toEqual(["device-1"]);
    const sessionKeys = Object.keys(window.sessionStorage).filter((k) =>
      k.startsWith(STORAGE_PREFIX)
    );
    expect(sessionKeys).toEqual([]);
  });
});

describe("the returning operator — same identity must not look like a switch", () => {
  it("remembers the scope in localStorage, so a new tab recovers it", async () => {
    // The trap this guards: setApiCacheSessionScope wipes both caches when the
    // scope it is handed differs from the REMEMBERED one. That memory used to
    // live in sessionStorage, so a fresh tab started at the default, the first
    // bootstrap looked like a user switch, and the wipe ran — which would have
    // silently defeated persisting the entries at all.
    setApiCacheSessionScope("user-a");

    const remembered = window.localStorage.getItem("tnm:session-cache-scope:v1");
    expect(remembered).toBe("user-a");
    // Not in the store that dies with the tab.
    expect(window.sessionStorage.getItem("tnm:session-cache-scope:v1")).toBeNull();
  });

  it("keeps cached entries when the same identity signs in again", async () => {
    await prefetchCachedFetch("fleet", async () => ["device-1"]);
    expect(storedEntryFor("fleet")?.data).toEqual(["device-1"]);

    // Same subject+email as beforeEach: this is the returning operator, not a
    // different principal. Nothing may be dropped.
    setApiCacheSessionScope("user-a");

    expect(storedEntryFor("fleet")?.data).toEqual(["device-1"]);
  });

  it("still wipes when a DIFFERENT identity signs in", async () => {
    // The guarantee the wipe exists for has to survive the fix.
    await prefetchCachedFetch("fleet", async () => ["device-1"]);
    expect(storedEntryFor("fleet")).not.toBeNull();

    setApiCacheSessionScope("user-b");

    expect(storedEntryFor("fleet")).toBeNull();
  });

  it("still wipes after an explicit sign-out", async () => {
    await prefetchCachedFetch("fleet", async () => ["device-1"]);
    setApiCacheSessionScope("signed-out");
    expect(storedEntryFor("fleet")).toBeNull();
  });
});
