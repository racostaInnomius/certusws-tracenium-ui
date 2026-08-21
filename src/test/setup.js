// src/test/setup.js
//
// Global Vitest setup: jest-dom matchers, MSW lifecycle and per-test
// reset of the http.js module-level state (GET cache, in-flight map,
// auth-redirect latch).

import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

import { server } from "./msw/server";
import {
  AUTH_REQUIRED_EVENT,
  clearApiCache,
  setApiCacheSessionScope,
} from "../api/http";

// vitest.config.js already raised testTimeout to 15000ms for exactly this
// reason ("MUI dialog + userEvent interaction tests ... can take ~8-10s
// under full-suite load") — but that budget only bounds the whole `it()`
// block. Testing Library's own findBy*/waitFor polling (what actually
// waits for a Dialog's portal + transition to mount) has a SEPARATE
// internal timeout, defaulting to 1000ms regardless of testTimeout. Under
// real CI load that default was too tight — a `findByRole("dialog")` can
// legitimately take longer than 1s to resolve, which reads as a random
// flake rather than a capacity problem. 5000ms gives real headroom while
// still leaving most of the 15s test budget for a test with more than one
// findBy in it.
configure({ asyncUtilTimeout: 5000 });

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
