// src/api/audit.test.js
//
// Contract tests for /api/v1/security/audit.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import { getAuditFacets, getAuditSummary, listAuditEvents } from "./audit";

const BASE = "/api/v1/security/audit";

describe("audit reads", () => {
  it("listAuditEvents forwards filters and drops empty/null/undefined ones", async () => {
    const calls = respond("get", `${BASE}/events`, { ok: true, items: [] });

    await listAuditEvents({
      actor: "admin@x.com",
      action: "policy.push",
      from: "2026-06-01",
      to: null,
      search: "",
      page: 1,
    });

    expect(calls[0].search).toEqual({
      actor: "admin@x.com",
      action: "policy.push",
      from: "2026-06-01",
      page: "1",
    });
  });

  it("getAuditSummary and getAuditFacets accept the same filter set", async () => {
    const summary = respond("get", `${BASE}/summary`, { ok: true });
    const facets = respond("get", `${BASE}/facets`, { ok: true, facets: {} });

    await getAuditSummary({ window: "7d" });
    await getAuditFacets();

    expect(summary[0].search).toEqual({ window: "7d" });
    expect(facets[0].searchString).toBe("");
  });

  it("returns the raw envelope for the page to unwrap", async () => {
    const envelope = { ok: true, total: 2, items: [{ id: 1 }, { id: 2 }] };
    respond("get", `${BASE}/events`, envelope);

    await expect(listAuditEvents()).resolves.toEqual(envelope);
  });
});
