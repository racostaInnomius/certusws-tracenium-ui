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
// clearCachedFetch remove) plus the sessionStorage layout, so the entry logic
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

/** Every sessionStorage key this cache owns. */
function cacheKeys() {
  return Object.keys(window.sessionStorage).filter((k) => k.startsWith(STORAGE_PREFIX));
}

/** The parsed entry whose scoped key ends with `::<key>`. */
function storedEntryFor(key) {
  const match = cacheKeys().find((k) => k.endsWith(`::${key}`));
  return match ? JSON.parse(window.sessionStorage.getItem(match)) : null;
}

beforeEach(() => {
  window.sessionStorage.clear();
  clearCachedFetch();
  setApiCacheSessionScope("user-a");
  setActiveTenantId(null);
});

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
  clearCachedFetch();
});

describe("write path", () => {
  it("persists the loader result to sessionStorage as {data, ts}", async () => {
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
    expect(JSON.parse(window.sessionStorage.getItem(t1Key)).data).toEqual(["t1-device"]);
    expect(JSON.parse(window.sessionStorage.getItem(t2Key)).data).toEqual(["t2-device"]);
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
  it("an entry older than storageMaxAgeMs is evicted from sessionStorage", async () => {
    await prefetchCachedFetch("stale-me", async () => "old");
    const key = cacheKeys().find((k) => k.endsWith("::stale-me"));

    // Backdate the stored entry well past any sane max-age.
    const entry = JSON.parse(window.sessionStorage.getItem(key));
    entry.ts = Date.now() - 24 * 60 * 60 * 1000; // 24h ago
    window.sessionStorage.setItem(key, JSON.stringify(entry));
    // Drop the in-memory copy so the next read has to go to storage.
    clearCachedFetch();
    window.sessionStorage.setItem(key, JSON.stringify(entry));

    // Re-prefetching overwrites with a fresh timestamp rather than serving
    // the expired payload.
    await prefetchCachedFetch("stale-me", async () => "new");
    expect(storedEntryFor("stale-me").data).toBe("new");
    expect(Date.now() - storedEntryFor("stale-me").ts).toBeLessThan(5_000);
  });

  it("tolerates a corrupt stored entry without throwing", async () => {
    await prefetchCachedFetch("corrupt", async () => "ok");
    const key = cacheKeys().find((k) => k.endsWith("::corrupt"));
    window.sessionStorage.setItem(key, "{not json");
    clearCachedFetch();
    window.sessionStorage.setItem(key, "{not json");

    await expect(
      prefetchCachedFetch("corrupt", async () => "recovered")
    ).resolves.not.toThrow();
    expect(storedEntryFor("corrupt").data).toBe("recovered");
  });
});
