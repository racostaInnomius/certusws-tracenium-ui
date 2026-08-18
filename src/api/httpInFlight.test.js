// In-flight GET de-duplication across a tenant switch.
//
// Measured on a real client switch: 28 requests where only 21 were
// distinct. `enterTenant` clears the cache, the shell re-renders and
// Overview fires its requests, then the un-awaited `refreshAuth()` lands
// and re-renders again — and the second wave could not reuse the first
// because clearApiCache() had also emptied the in-flight map.
//
// Clearing it there was never needed: cache keys are scoped by active
// tenant, so an entry from tenant A cannot be adopted by tenant B.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { httpGetJson, clearApiCache, setActiveTenantId } from "./http";

const ok = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  clearApiCache();
  setActiveTenantId(null);
});
afterEach(() => {
  setActiveTenantId(null);
  vi.restoreAllMocks();
});

describe("clearApiCache({ keepInFlight: true })", () => {
  it("lets a second caller adopt a request that is still in flight", async () => {
    // Collect every pending resolver: a mock that keeps only the last one
    // deadlocks as soon as a test issues two requests.
    const pendientes = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise((r) => pendientes.push(() => r(ok({ n: 1 }))))
    );

    const first = httpGetJson("/api/v1/dashboard/summary");
    // The switch happens while the first wave is still outstanding.
    clearApiCache({ keepInFlight: true });
    const second = httpGetJson("/api/v1/dashboard/summary");

    pendientes.forEach((f) => f());
    await Promise.all([first, second]);

    // One network call for two callers — the point of the whole change.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("still issues a fresh request when the in-flight map IS cleared", async () => {
    // The mutation path keeps the old behaviour: a GET that left before a
    // write carries pre-write data, so a later caller must not adopt it.
    const pendientes = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise((r) => pendientes.push(() => r(ok({ n: 1 }))))
    );

    const first = httpGetJson("/api/v1/dashboard/summary");
    clearApiCache();
    const second = httpGetJson("/api/v1/dashboard/summary");

    pendientes.forEach((f) => f());
    await Promise.all([first, second]).catch(() => {});

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("tenant scoping makes the wipe unnecessary", () => {
  it("does not serve one tenant's in-flight request to another", async () => {
    // The cross-tenant leak the wipe was defending against. It cannot
    // happen, because the cache key carries the active tenant.
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      return ok({ tenant: calls });
    });

    setActiveTenantId("1");
    const a = httpGetJson("/api/v1/dashboard/summary");
    setActiveTenantId("113");
    const b = httpGetJson("/api/v1/dashboard/summary");

    await Promise.all([a, b]);
    expect(calls).toBe(2);
  });
});
