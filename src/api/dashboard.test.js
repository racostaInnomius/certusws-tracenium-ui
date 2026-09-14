// src/api/dashboard.test.js
//
// Contract tests for the dashboardApi object (/api/v1/dashboard).

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import { dashboardApi } from "./dashboard";

const BASE = "/api/v1/dashboard";

describe("dashboardApi", () => {
  it("summary / hosts / printers are plain reads", async () => {
    const summary = respond("get", `${BASE}/summary`, { ok: true, totals: {} });
    const hosts = respond("get", `${BASE}/hosts`, { ok: true, items: [] });
    const printers = respond("get", `${BASE}/printers`, { ok: true, items: [] });

    await expect(dashboardApi.getSummary()).resolves.toEqual({ ok: true, totals: {} });
    await dashboardApi.getHosts();
    await dashboardApi.getPrinters();

    expect(summary[0].pathname).toBe(`${BASE}/summary`);
    expect(hosts[0].pathname).toBe(`${BASE}/hosts`);
    expect(printers[0].pathname).toBe(`${BASE}/printers`);
  });

  it("getHostDetail encodes the agentId in the detail path", async () => {
    const calls = respond("get", `${BASE}/hosts/:agentId/detail`, { ok: true, host: {} });

    await dashboardApi.getHostDetail("agent/01");

    expect(calls[0].pathname).toBe(`${BASE}/hosts/agent%2F01/detail`);
  });

  it("getHostPrinters asks for the per-device projection together with its read scopes", async () => {
    const calls = respond("get", `${BASE}/hosts/:agentId/printers`, { items: [], scan: null });

    await expect(dashboardApi.getHostPrinters("agent-1")).resolves.toEqual({ items: [], scan: null });
    expect(calls[0].pathname).toBe(`${BASE}/hosts/agent-1/printers`);
    expect(calls[0].search).toEqual({ include: "scan" });
  });
});
