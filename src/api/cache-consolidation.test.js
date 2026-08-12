import { describe, it, expect, vi } from "vitest";
import {
  registerCacheClearListener,
  setApiCacheSessionScope,
  getApiCacheSessionScope,
} from "./http";
// Importing the hook module registers its clearCachedFetch as a scope listener.
import { getCachedFetchSessionScope, setCachedFetchSessionScope } from "../hooks/useCachedFetch";

describe("SWR cache scope consolidation", () => {
  it("useCachedFetch session scope now delegates to http.js (single source)", () => {
    setApiCacheSessionScope("scope-a");
    expect(getCachedFetchSessionScope()).toBe("scope-a");
    expect(getCachedFetchSessionScope()).toBe(getApiCacheSessionScope());
  });

  it("setCachedFetchSessionScope delegates to the http owner", () => {
    setCachedFetchSessionScope("scope-b");
    expect(getApiCacheSessionScope()).toBe("scope-b");
  });

  it("a registered listener fires once per real scope change (one call clears both caches)", () => {
    setApiCacheSessionScope("scope-c");
    const listener = vi.fn();
    const unregister = registerCacheClearListener(listener);

    setApiCacheSessionScope("scope-d"); // changed → fires
    expect(listener).toHaveBeenCalledTimes(1);

    setApiCacheSessionScope("scope-d"); // unchanged → no fire
    expect(listener).toHaveBeenCalledTimes(1);

    unregister();
    setApiCacheSessionScope("scope-e"); // changed, but unregistered → no fire
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
