// src/api/http.empty-body.test.js
//
// A 204 has no body, and res.json() rejects on an empty stream. Every gateway
// DELETE answers 204, so before this the caller received a thrown SyntaxError
// and told the operator the removal had failed — while the row was gone.
//
// Paired with the other half of the same confusion: these endpoints return the
// entity itself, never an `{ ok, data }` envelope. Only some older modules put
// an `ok` field *inside* their JSON, and copying that check onto the gateway
// panel made every successful call look rejected.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { httpDeleteJson, httpPostJson } from "./http";

function jsonResponse(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("http helpers with empty and envelope-less bodies", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves a 204 instead of choking on the empty body", async () => {
    // The exact shape of DELETE /gateways/:id.
    global.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(httpDeleteJson("/api/v1/patch-management/gateways/1")).resolves.toBeNull();
  });

  it("resolves a 200 that declares a zero-length body", async () => {
    global.fetch.mockResolvedValue(
      new Response(null, { status: 200, headers: { "content-length": "0" } })
    );
    await expect(httpDeleteJson("/api/v1/x")).resolves.toBeNull();
  });

  it("returns the entity for a 201, with no ok envelope around it", async () => {
    // POST /gateways answers 201 with the gateway itself. Any caller testing
    // `res.ok` on this would read undefined and call a success a failure.
    const gateway = { id: 1, name: "MSIG-vCenter-Gateway", deviceId: "dev-1" };
    global.fetch.mockResolvedValue(jsonResponse(201, gateway));

    const out = await httpPostJson("/api/v1/patch-management/gateways", {});
    expect(out).toEqual(gateway);
    expect(out.ok).toBeUndefined();
  });

  it("still parses a normal 200 body", async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { gateways: [{ id: 1 }] }));
    await expect(httpPostJson("/api/v1/x", {})).resolves.toEqual({ gateways: [{ id: 1 }] });
  });

  it("throws on a non-2xx and carries the server message", async () => {
    // What the caller must rely on instead of an `ok` field.
    global.fetch.mockResolvedValue(jsonResponse(400, { error: "validation_error", message: "vcenterUrl is required" }));

    await expect(httpPostJson("/api/v1/patch-management/gateways", {})).rejects.toMatchObject({
      status: 400,
      body: { message: "vcenterUrl is required" },
    });
  });
});
