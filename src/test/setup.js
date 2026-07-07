// src/test/setup.js
//
// Global Vitest setup: jest-dom matchers, MSW lifecycle and per-test
// reset of the http.js module-level state (GET cache, in-flight map,
// auth-redirect latch).

import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

import { server } from "./msw/server";
import {
  AUTH_REQUIRED_EVENT,
  clearApiCache,
  setApiCacheSessionScope,
} from "../api/http";

// http.js falls back to window.location.assign(loginUrl) 50 ms after a
// backend-confirmed 401 when no listener marks the event as handled.
// jsdom cannot navigate, so a global listener claims the event exactly
// like AuthProvider does in the real app. Tests can still attach their
// own listeners to observe the event.
window.addEventListener(AUTH_REQUIRED_EVENT, (event) => {
  event.preventDefault();
});

beforeAll(() => {
  // Any request without an explicit handler is a test bug (wrong path
  // built by the module under test) — fail loudly instead of timing out.
  server.listen({ onUnhandledRequest: "error" });
});

beforeEach(() => {
  // Resets the internal `authRedirectStarted` latch (set unconditionally
  // by setApiCacheSessionScope) so a 401 in one test does not swallow
  // the auth event of the next one.
  setApiCacheSessionScope("vitest");
  // Session scope is stable across tests, so clear caches explicitly.
  clearApiCache();
  window.sessionStorage.clear();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
