// src/api/tenants.test.js
//
// Contract tests for /api/v1/tenants (+ members sub-collection).

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  createTenantMember,
  deleteTenant,
  deleteTenantMember,
  getTenantById,
  getTenantSummary,
  listTenantMembers,
  listTenants,
  updateTenant,
  updateTenantMember,
} from "./tenants";

const BASE = "/api/v1/tenants";

describe("tenants", () => {
  it("listTenants reads the collection", async () => {
    const calls = respond("get", BASE, { ok: true, items: [] });

    await listTenants();

    expect(calls[0].pathname).toBe(BASE);
  });

  it("tenant reads interpolate the id normally", async () => {
    const byId = respond("get", `${BASE}/:tenantId`, { ok: true });
    const summary = respond("get", `${BASE}/:tenantId/summary`, { ok: true });

    await getTenantById("t-1");
    await getTenantSummary("t-1");

    expect(byId[0].pathname).toBe(`${BASE}/t-1`);
    expect(summary[0].pathname).toBe(`${BASE}/t-1/summary`);
  });

  it("encodes special characters in the tenant id path param", async () => {
    // Consistency with sibling modules (jobs/policies/certificates):
    // a path id with `/` or spaces must be percent-encoded so it stays a
    // single path segment instead of building a different URL.
    const byId = respond("get", /\/api\/v1\/tenants\/.+/, { ok: true });
    const summary = respond("get", /\/api\/v1\/tenants\/.+\/summary/, { ok: true });

    await getTenantById("a/b c");
    await getTenantSummary("a/b c");

    expect(byId[0].pathname).toBe(`${BASE}/a%2Fb%20c`);
    expect(summary[0].pathname).toBe(`${BASE}/a%2Fb%20c/summary`);
  });

  it("encodes special characters in nested member id path params", async () => {
    const update = respond("put", /\/api\/v1\/tenants\/.+\/members\/.+/, { ok: true });

    await updateTenantMember("a/b", "m/1", { role: "VIEWER" });

    expect(update[0].pathname).toBe(`${BASE}/a%2Fb/members/m%2F1`);
  });

  it("updateTenant PUTs the payload; deleteTenant issues DELETE", async () => {
    const update = respond("put", `${BASE}/:tenantId`, { ok: true });
    const del = respond("delete", `${BASE}/:tenantId`, { ok: true });

    await updateTenant("t-1", { displayName: "ACME" });
    await deleteTenant("t-1");

    expect(update[0].method).toBe("PUT");
    expect(update[0].body).toEqual({ displayName: "ACME" });
    expect(del[0].method).toBe("DELETE");
  });
});

describe("tenant members", () => {
  it("member CRUD nests under the tenant", async () => {
    const list = respond("get", `${BASE}/:tenantId/members`, { ok: true, items: [] });
    const create = respond("post", `${BASE}/:tenantId/members`, { ok: true, id: "m1" });
    const update = respond("put", `${BASE}/:tenantId/members/:memberId`, { ok: true });
    const del = respond("delete", `${BASE}/:tenantId/members/:memberId`, { ok: true });

    await listTenantMembers("t-1");
    await createTenantMember("t-1", { email: "a@b.com", role: "ADMIN" });
    await updateTenantMember("t-1", "m1", { role: "VIEWER" });
    await deleteTenantMember("t-1", "m1");

    expect(list[0].pathname).toBe(`${BASE}/t-1/members`);
    expect(create[0].body).toEqual({ email: "a@b.com", role: "ADMIN" });
    expect(update[0].pathname).toBe(`${BASE}/t-1/members/m1`);
    expect(update[0].body).toEqual({ role: "VIEWER" });
    expect(del[0].method).toBe("DELETE");
  });
});
