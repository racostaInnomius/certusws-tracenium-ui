// src/test/msw/server.js
//
// Shared MSW server + request-capture helpers for the API-layer tests.
//
// The API layer (src/api/http.js) resolves every request against
// `import.meta.env.VITE_API_BASE`, which vitest.config.js pins to
// http://tracenium-api.test — MSW intercepts on that origin.

import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const API_BASE = import.meta.env.VITE_API_BASE;

export const server = setupServer();

const BODYLESS_METHODS = new Set(["GET", "HEAD", "DELETE"]);

/**
 * Register a one-off handler for `method path` that records every
 * incoming request (query params, JSON body, headers) and answers
 * with `json` / `status`.
 *
 * Returns the mutable `calls` array so a test can make the call and
 * then assert on the exact request shape the module produced:
 *
 *   const calls = respond("get", "/api/v1/foo", { ok: true });
 *   await listFoo({ q: "bar" });
 *   expect(calls[0].search).toEqual({ q: "bar" });
 *
 * `path` may also be a RegExp for endpoints whose literal path would
 * confuse path-to-regexp (e.g. `/findings:bulk`).
 */
export function respond(method, path, json = { ok: true }, { status = 200 } = {}) {
  const calls = [];
  const matcher = path instanceof RegExp ? path : `${API_BASE}${path}`;

  server.use(
    http[method](matcher, async ({ request, params }) => {
      const url = new URL(request.url);

      let body = null;
      let rawBody = null;
      if (!BODYLESS_METHODS.has(request.method)) {
        rawBody = await request.clone().text();
        try {
          body = rawBody ? JSON.parse(rawBody) : null;
        } catch {
          body = null;
        }
      }

      calls.push({
        method: request.method,
        pathname: url.pathname,
        search: Object.fromEntries(url.searchParams),
        searchString: url.search,
        body,
        rawBody,
        params,
        headers: Object.fromEntries(request.headers.entries()),
        credentials: request.credentials,
      });

      return HttpResponse.json(json, { status });
    })
  );

  return calls;
}

/** Handler that simulates a low-level network failure (DNS/socket). */
export function respondNetworkError(method, path) {
  server.use(
    http[method](`${API_BASE}${path}`, () => HttpResponse.error())
  );
}

export { http, HttpResponse };
