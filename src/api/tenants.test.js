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

  it("tenant reads interpolate the id RAW (no encodeURIComponent — inconsistent with sibling modules)", async () => {
    // Documented hallazgo: tenant ids are backend UUIDs so this works
    // today, but unlike jobs/policies/certificates this module does not
    // encode path params. An id containing `/` or `?` would build a
    // different URL.
    const byId = respond("get", `${BASE}/:tenantId`, { ok: true });
    const summary = respond("get", `${BASE}/:tenantId/summary`, { ok: true });

    await getTenantById("t-1");
    await getTenantSummary("t-1");

    expect(byId[0].pathname).toBe(`${BASE}/t-1`);
    expect(summary[0].pathname).toBe(`${BASE}/t-1/summary`);
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
