// src/api/http.test.js
//
// Contract tests for the shared HTTP layer: request shape, error
// taxonomy (AuthError vs TemporaryServerError vs plain HTTP error),
// GET cache semantics and the auth/temporary-error window events.

import { describe, expect, it } from "vitest";
import { delay } from "msw";

import {
  API_BASE,
  HttpResponse,
  http,
  respond,
  respondNetworkError,
  server,
} from "../test/msw/server";

import {
  AUTH_REQUIRED_EVENT,
  AuthError,
  TEMPORARY_ERROR_EVENT,
  TemporaryServerError,
  clearApiCache,
  getApiCacheSnapshot,
  getApiWsUrl,
  getLoginUrl,
  httpDeleteJson,
  httpGetJson,
  httpPatchJson,
  httpPostJson,
  httpPutJson,
  invalidateApiCache,
  invalidateApiCachePrefix,
  isAuthError,
  prefetchApiGetJson,
  isTemporaryApiError,
  setApiCacheSessionScope,
} from "./http";

/** Collect window events of `type` for the duration of `fn()`. */
async function captureEvents(type, fn) {
  const events = [];
  const listener = (event) => events.push(event.detail);
  window.addEventListener(type, listener);
  try {
    await fn();
  } finally {
    window.removeEventListener(type, listener);
  }
  return events;
}

describe("httpGetJson — request shape", () => {
  it("issues GET against VITE_API_BASE with cookies included", async () => {
    const calls = respond("get", "/api/v1/example", { ok: true, value: 42 });

    const data = await httpGetJson("/api/v1/example");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].pathname).toBe("/api/v1/example");
    // Session cookie auth: every call must carry credentials.
    expect(calls[0].credentials).toBe("include");
    expect(data).toEqual({ ok: true, value: 42 });
  });
});

describe("httpGetJson — error taxonomy", () => {
  it("HTTP 401 → AuthError with code UNAUTHENTICATED", async () => {
    respond("get", "/api/v1/secret", { error: "UNAUTHENTICATED", message: "no session" }, { status: 401 });

    const err = await httpGetJson("/api/v1/secret").catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("UNAUTHENTICATED");
    expect(err.body).toEqual({ error: "UNAUTHENTICATED", message: "no session" });
    expect(isAuthError(err)).toBe(true);
  });

  it("HTTP 401 dispatches the auth-required window event once", async () => {
    respond("get", "/api/v1/secret", { error: "UNAUTHENTICATED" }, { status: 401 });

    const events = await captureEvents(AUTH_REQUIRED_EVENT, async () => {
      await httpGetJson("/api/v1/secret").catch(() => {});
      // Second 401 in the same "session" must NOT re-dispatch — the
      // module latches until the session scope is reset.
      await httpGetJson("/api/v1/secret").catch(() => {});
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(401);
    expect(events[0].code).toBe("UNAUTHENTICATED");
    expect(events[0].url).toBe("/api/v1/secret");
  });

  it("a backend-confirmed 401 clears cached GET data from other endpoints", async () => {
    respond("get", "/api/v1/cached-list", { ok: true, items: [1] });
    respond("get", "/api/v1/secret", { error: "UNAUTHENTICATED" }, { status: 401 });

    await httpGetJson("/api/v1/cached-list");
    expect(getApiCacheSnapshot("/api/v1/cached-list").hasCache).toBe(true);

    await httpGetJson("/api/v1/secret").catch(() => {});

    expect(getApiCacheSnapshot("/api/v1/cached-list").hasCache).toBe(false);
  });

  it("non-401 response with body.error UNAUTHENTICATED is coerced to AuthError status 401", async () => {
    // Documents real behavior: the body error code wins over the HTTP
    // status — a 403 carrying UNAUTHENTICATED becomes an auth error.
    respond("get", "/api/v1/coerced", { error: "UNAUTHENTICATED" }, { status: 403 });

    const err = await httpGetJson("/api/v1/coerced").catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(401);
  });

  it("HTTP 403 → plain Error with status/code, not retryable, no logout event", async () => {
    respond("get", "/api/v1/forbidden", { error: "FORBIDDEN", message: "nope" }, { status: 403 });

    const authEvents = await captureEvents(AUTH_REQUIRED_EVENT, async () => {
      const err = await httpGetJson("/api/v1/forbidden").catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(AuthError);
      expect(err).not.toBeInstanceOf(TemporaryServerError);
      expect(err.status).toBe(403);
      expect(err.code).toBe("FORBIDDEN");
      expect(err.body).toEqual({ error: "FORBIDDEN", message: "nope" });
      expect(isAuthError(err)).toBe(false);
      expect(isTemporaryApiError(err)).toBe(false);
    });

    expect(authEvents).toHaveLength(0);
  });

  it("HTTP 4xx without body error code falls back to code HTTP_<status>", async () => {
    respond("get", "/api/v1/missing", {}, { status: 404 });

    const err = await httpGetJson("/api/v1/missing").catch((e) => e);

    expect(err.status).toBe(404);
    expect(err.code).toBe("HTTP_404");
    expect(err.message).toMatch(/^HTTP 404/);
  });

  it("HTTP 500 → TemporaryServerError (any 5xx is treated as temporary)", async () => {
    respond("get", "/api/v1/broken", { message: "boom" }, { status: 500 });

    const err = await httpGetJson("/api/v1/broken").catch((e) => e);

    expect(err).toBeInstanceOf(TemporaryServerError);
    expect(err.status).toBe(500);
    expect(err.retryable).toBe(true);
    expect(isTemporaryApiError(err)).toBe(true);
    expect(isAuthError(err)).toBe(false);
  });

  it("HTTP 503 → TemporaryServerError with backend message", async () => {
    respond("get", "/api/v1/maintenance", { error: "TEMPORARY_SERVER_ERROR", message: "db restarting" }, { status: 503 });

    const err = await httpGetJson("/api/v1/maintenance").catch((e) => e);

    expect(err).toBeInstanceOf(TemporaryServerError);
    expect(err.status).toBe(503);
    expect(err.code).toBe("TEMPORARY_SERVER_ERROR");
    expect(err.message).toBe("db restarting");
  });

  it("4xx body with retryable=true is classified as temporary", async () => {
    respond("get", "/api/v1/retry-me", { retryable: true, message: "try later" }, { status: 429 });

    const err = await httpGetJson("/api/v1/retry-me").catch((e) => e);

    expect(err).toBeInstanceOf(TemporaryServerError);
    expect(err.status).toBe(429);
  });

  it("network failure → TemporaryServerError NETWORK_ERROR", async () => {
    respondNetworkError("get", "/api/v1/unreachable");

    const err = await httpGetJson("/api/v1/unreachable").catch((e) => e);

    expect(err).toBeInstanceOf(TemporaryServerError);
    expect(err.code).toBe("NETWORK_ERROR");
    expect(isTemporaryApiError(err)).toBe(true);
  });

  it("client-side timeout → TemporaryServerError REQUEST_TIMEOUT", async () => {
    server.use(
      http.get(`${API_BASE}/api/v1/slow`, async () => {
        await delay(500);
        return HttpResponse.json({ ok: true });
      })
    );

    const err = await httpGetJson("/api/v1/slow", { timeoutMs: 50 }).catch((e) => e);

    expect(err).toBeInstanceOf(TemporaryServerError);
    expect(err.code).toBe("REQUEST_TIMEOUT");
  });
});

describe("httpGetJson — cache semantics", () => {
  it("serves a fresh cached entry without re-hitting the network", async () => {
    const calls = respond("get", "/api/v1/cacheable", { ok: true, n: 1 });

    const first = await httpGetJson("/api/v1/cacheable");
    const second = await httpGetJson("/api/v1/cacheable");

    expect(calls).toHaveLength(1);
    expect(second).toEqual(first);

    const snapshot = getApiCacheSnapshot("/api/v1/cacheable");
    expect(snapshot.hasCache).toBe(true);
    expect(snapshot.isStale).toBe(false);
    expect(snapshot.data).toEqual({ ok: true, n: 1 });
  });

  it("cache: 'reload' bypasses the fresh entry and refetches", async () => {
    const calls = respond("get", "/api/v1/reloadable", { ok: true });

    await httpGetJson("/api/v1/reloadable");
    await httpGetJson("/api/v1/reloadable", { cache: "reload" });

    expect(calls).toHaveLength(2);
  });

  it("health endpoints use the no-store profile (always live)", async () => {
    const calls = respond("get", "/api/v1/health", { ok: true });

    await httpGetJson("/api/v1/health");
    await httpGetJson("/api/v1/health");

    expect(calls).toHaveLength(2);
    expect(getApiCacheSnapshot("/api/v1/health").hasCache).toBe(false);
  });

  it("deduplicates concurrent in-flight GETs to a single network call", async () => {
    let hits = 0;
    server.use(
      http.get(`${API_BASE}/api/v1/dedupe`, async () => {
        hits += 1;
        await delay(30);
        return HttpResponse.json({ ok: true, hits });
      })
    );

    const [a, b] = await Promise.all([
      httpGetJson("/api/v1/dedupe"),
      httpGetJson("/api/v1/dedupe"),
    ]);

    expect(hits).toBe(1);
    expect(a).toBe(b);
  });

  it("temporary refresh failure returns last-known-good data and emits a warning event", async () => {
    respond("get", "/api/v1/flaky", { ok: true, generation: 1 });
    await httpGetJson("/api/v1/flaky");

    // Backend degrades: same URL now 503s.
    respond("get", "/api/v1/flaky", { message: "down" }, { status: 503 });

    const events = await captureEvents(TEMPORARY_ERROR_EVENT, async () => {
      const data = await httpGetJson("/api/v1/flaky", { cache: "reload" });
      // Must NOT throw and must serve the cached generation.
      expect(data).toEqual({ ok: true, generation: 1 });
    });

    expect(events).toHaveLength(1);
    expect(events[0].hasCachedData).toBe(true);
    expect(events[0].url).toBe("/api/v1/flaky");
  });

  it("temporary failure without cached data rethrows and emits hasCachedData:false", async () => {
    respond("get", "/api/v1/cold-failure", { message: "down" }, { status: 503 });

    const events = await captureEvents(TEMPORARY_ERROR_EVENT, async () => {
      const err = await httpGetJson("/api/v1/cold-failure").catch((e) => e);
      expect(err).toBeInstanceOf(TemporaryServerError);
    });

    expect(events).toHaveLength(1);
    expect(events[0].hasCachedData).toBe(false);
  });

  it("notifyOnTemporaryError: false suppresses the warning event", async () => {
    respond("get", "/api/v1/silent-failure", { message: "down" }, { status: 503 });

    const events = await captureEvents(TEMPORARY_ERROR_EVENT, async () => {
      await httpGetJson("/api/v1/silent-failure", { notifyOnTemporaryError: false }).catch(() => {});
    });

    expect(events).toHaveLength(0);
  });

  it("invalidateApiCache forces the next GET back to the network", async () => {
    const calls = respond("get", "/api/v1/invalidate-me", { ok: true });

    await httpGetJson("/api/v1/invalidate-me");
    invalidateApiCache("/api/v1/invalidate-me");
    await httpGetJson("/api/v1/invalidate-me");

    expect(calls).toHaveLength(2);
  });

  it("invalidateApiCachePrefix drops every entry under the prefix but keeps the rest", async () => {
    const a = respond("get", "/api/v1/widgets/a", { ok: true });
    const b = respond("get", "/api/v1/widgets/b", { ok: true });
    const other = respond("get", "/api/v1/other", { ok: true });

    await httpGetJson("/api/v1/widgets/a");
    await httpGetJson("/api/v1/widgets/b");
    await httpGetJson("/api/v1/other");

    invalidateApiCachePrefix("/api/v1/widgets");

    await httpGetJson("/api/v1/widgets/a");
    await httpGetJson("/api/v1/widgets/b");
    await httpGetJson("/api/v1/other");

    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    expect(other).toHaveLength(1);
  });

  it("prefetchApiGetJson warms the cache for later reads", async () => {
    const calls = respond("get", "/api/v1/prefetched", { ok: true });

    await prefetchApiGetJson("/api/v1/prefetched");
    const data = await httpGetJson("/api/v1/prefetched");

    expect(calls).toHaveLength(1);
    expect(data).toEqual({ ok: true });
  });

  it("changing the session scope clears cached data (tenant/user switch)", async () => {
    const calls = respond("get", "/api/v1/scoped", { ok: true });

    await httpGetJson("/api/v1/scoped");
    setApiCacheSessionScope("another-user");
    await httpGetJson("/api/v1/scoped");

    expect(calls).toHaveLength(2);
  });

  it("clearApiCache wipes both memory and sessionStorage entries", async () => {
    respond("get", "/api/v1/wipe-me", { ok: true });

    await httpGetJson("/api/v1/wipe-me");
    expect(getApiCacheSnapshot("/api/v1/wipe-me").hasCache).toBe(true);

    clearApiCache();

    expect(getApiCacheSnapshot("/api/v1/wipe-me").hasCache).toBe(false);
    const keys = Object.keys(window.sessionStorage).filter((k) => k.startsWith("tnm:http-cache:"));
    expect(keys).toHaveLength(0);
  });
});

describe("mutations — request shape and cache invalidation", () => {
  it("httpPostJson sends JSON body with content-type and credentials", async () => {
    const calls = respond("post", "/api/v1/things", { ok: true, id: "t1" });

    const res = await httpPostJson("/api/v1/things", { name: "x", count: 2 });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(calls[0].credentials).toBe("include");
    expect(calls[0].body).toEqual({ name: "x", count: 2 });
    expect(res).toEqual({ ok: true, id: "t1" });
  });

  it("httpPutJson merges caller-provided headers (If-Match opt-locking)", async () => {
    const calls = respond("put", "/api/v1/things/t1", { ok: true });

    await httpPutJson("/api/v1/things/t1", { name: "y" }, { headers: { "If-Match": "7" } });

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].headers["if-match"]).toBe("7");
    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(calls[0].body).toEqual({ name: "y" });
  });

  it("httpPatchJson sends PATCH with partial body", async () => {
    const calls = respond("patch", "/api/v1/things/t1", { ok: true });

    await httpPatchJson("/api/v1/things/t1", { enabled: false });

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].body).toEqual({ enabled: false });
  });

  it("httpDeleteJson sends DELETE without a body", async () => {
    const calls = respond("delete", "/api/v1/things/t1", { ok: true });

    await httpDeleteJson("/api/v1/things/t1");

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].body).toBeNull();
  });

  it("any successful mutation clears the whole GET cache", async () => {
    const getCalls = respond("get", "/api/v1/list", { ok: true });
    respond("post", "/api/v1/list", { ok: true });

    await httpGetJson("/api/v1/list");
    await httpPostJson("/api/v1/list", {});
    await httpGetJson("/api/v1/list");

    expect(getCalls).toHaveLength(2);
  });

  it("mutation errors use the same taxonomy (401 → AuthError, 500 → temporary)", async () => {
    respond("post", "/api/v1/auth-write", { error: "UNAUTHENTICATED" }, { status: 401 });
    respond("post", "/api/v1/broken-write", { message: "boom" }, { status: 500 });

    const authErr = await httpPostJson("/api/v1/auth-write", {}).catch((e) => e);
    const tempErr = await httpPostJson("/api/v1/broken-write", {}).catch((e) => e);

    expect(authErr).toBeInstanceOf(AuthError);
    expect(tempErr).toBeInstanceOf(TemporaryServerError);
  });
});

describe("URL helpers", () => {
  it("getLoginUrl points at the backend origin", () => {
    expect(getLoginUrl()).toBe(`${API_BASE}/auth/login`);
  });

  it("getApiWsUrl resolves relative paths against VITE_API_BASE with ws scheme", () => {
    const wsBase = API_BASE.replace(/^http/, "ws");
    expect(getApiWsUrl("/api/v1/remote-control/signaling/abc")).toBe(
      `${wsBase}/api/v1/remote-control/signaling/abc`
    );
  });

  it("getApiWsUrl normalizes absolute https URLs to wss", () => {
    expect(getApiWsUrl("https://api.tracenium.com/api/v1/x")).toBe(
      "wss://api.tracenium.com/api/v1/x"
    );
  });
});
