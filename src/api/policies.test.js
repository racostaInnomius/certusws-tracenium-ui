// src/api/policies.test.js
//
// Contract tests for /api/v1/policies — including the If-Match
// optimistic-locking header contract (Phase 2.B).

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  deleteDevicePolicy,
  getDevicePolicy,
  getDevicePolicyStatus,
  getEffectivePolicy,
  getPluginCatalog,
  getTenantPolicy,
  listTenantPolicyStatus,
  pushDevicePolicy,
  pushTenantPolicy,
  saveDevicePolicy,
  saveTenantPolicy,
} from "./policies";

const BASE = "/api/v1/policies";

describe("tenant policy", () => {
  it("getTenantPolicy encodes the tenantId", async () => {
    const calls = respond("get", `${BASE}/tenants/:tenantId/policy`, { ok: true, policy: {} });

    await getTenantPolicy("tenant 1");

    expect(calls[0].pathname).toBe(`${BASE}/tenants/tenant%201/policy`);
  });

  it("saveTenantPolicy PUTs the policy WITHOUT If-Match when no expectedVersion (legacy last-writer-wins)", async () => {
    const calls = respond("put", `${BASE}/tenants/:tenantId/policy`, { ok: true });

    await saveTenantPolicy("t1", { plugins: { amp: { enabled: true } } });

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toEqual({ plugins: { amp: { enabled: true } } });
    expect(calls[0].headers["if-match"]).toBeUndefined();
  });

  it("saveTenantPolicy adds If-Match when expectedVersion is provided (including 0)", async () => {
    const calls = respond("put", `${BASE}/tenants/:tenantId/policy`, { ok: true });

    await saveTenantPolicy("t1", {}, { expectedVersion: 7 });
    await saveTenantPolicy("t1", {}, { expectedVersion: 0 });

    expect(calls[0].headers["if-match"]).toBe("7");
    expect(calls[1].headers["if-match"]).toBe("0");
  });

  it("stale write (409 STALE_POLICY) surfaces status and code to the caller", async () => {
    respond(
      "put",
      `${BASE}/tenants/:tenantId/policy`,
      { error: "STALE_POLICY", message: "someone else wrote first" },
      { status: 409 }
    );

    const err = await saveTenantPolicy("t1", {}, { expectedVersion: 3 }).catch((e) => e);

    expect(err.status).toBe(409);
    expect(err.code).toBe("STALE_POLICY");
  });

  it("pushTenantPolicy POSTs an empty body to /policy/push", async () => {
    const calls = respond("post", `${BASE}/tenants/:tenantId/policy/push`, { ok: true });

    await pushTenantPolicy("t1");

    expect(calls[0].pathname).toBe(`${BASE}/tenants/t1/policy/push`);
    expect(calls[0].body).toEqual({});
  });

  it("listTenantPolicyStatus reads /policy-status", async () => {
    const calls = respond("get", `${BASE}/tenants/:tenantId/policy-status`, { ok: true, items: [] });

    await listTenantPolicyStatus("t1");

    expect(calls[0].pathname).toBe(`${BASE}/tenants/t1/policy-status`);
  });
});

describe("device policy", () => {
  it("device policy CRUD hits the device-scoped paths with encoding", async () => {
    const get = respond("get", `${BASE}/devices/:deviceId/policy`, { ok: true, policy: {} });
    const del = respond("delete", `${BASE}/devices/:deviceId/policy`, { ok: true });
    const push = respond("post", `${BASE}/devices/:deviceId/policy/push`, { ok: true });

    await getDevicePolicy("dev/1");
    await deleteDevicePolicy("dev/1");
    await pushDevicePolicy("dev/1");

    expect(get[0].pathname).toBe(`${BASE}/devices/dev%2F1/policy`);
    expect(del[0].method).toBe("DELETE");
    expect(push[0].body).toEqual({});
  });

  it("saveDevicePolicy supports the same If-Match contract as tenant saves", async () => {
    const calls = respond("put", `${BASE}/devices/:deviceId/policy`, { ok: true });

    await saveDevicePolicy("d1", { plugins: {} }, { expectedVersion: "12" });

    expect(calls[0].headers["if-match"]).toBe("12");
    expect(calls[0].body).toEqual({ plugins: {} });
  });

  it("effective policy and per-device status are plain reads", async () => {
    const effective = respond("get", `${BASE}/devices/:deviceId/effective-policy`, { ok: true });
    const status = respond("get", `${BASE}/devices/:deviceId/policy-status`, { ok: true });

    await getEffectivePolicy("d1");
    await getDevicePolicyStatus("d1");

    expect(effective[0].pathname).toBe(`${BASE}/devices/d1/effective-policy`);
    expect(status[0].pathname).toBe(`${BASE}/devices/d1/policy-status`);
  });
});

describe("plugin catalog", () => {
  it("getPluginCatalog reads the canonical catalog envelope", async () => {
    const envelope = { ok: true, catalog: [{ id: "amp" }, { id: "scp" }] };
    const calls = respond("get", `${BASE}/plugins/catalog`, envelope);

    await expect(getPluginCatalog()).resolves.toEqual(envelope);
    expect(calls[0].pathname).toBe(`${BASE}/plugins/catalog`);
  });
});
