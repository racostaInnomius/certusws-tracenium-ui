// src/api/inventoryDashboard.test.js
//
// Contract tests for the inventory views under /api/v1/dashboard.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  getHardwareInventoryDetail,
  getHardwareInventoryRankings,
  getHardwareInventorySummary,
  getInactiveAssets,
  getSoftwareInventoryDetail,
  getSoftwareInventoryHostApps,
  getSoftwareInventoryHosts,
  getSoftwareInventoryRankings,
  getSoftwareInventorySummary,
  getBrowserInventory,
} from "./inventoryDashboard";

const BASE = "/api/v1/dashboard";

describe("inventory dashboard", () => {
  it("getInactiveAssets forwards threshold filters", async () => {
    const calls = respond("get", `${BASE}/inactive-assets`, { ok: true, items: [] });

    await getInactiveAssets({ inactiveDays: 30, page: 1 });

    expect(calls[0].search).toEqual({ inactiveDays: "30", page: "1" });
  });

  it("hardware summary/rankings/detail hit their sub-paths", async () => {
    const summary = respond("get", `${BASE}/hardware-inventory/summary`, { ok: true });
    const rankings = respond("get", `${BASE}/hardware-inventory/rankings`, { ok: true });
    const detail = respond("get", `${BASE}/hardware-inventory/detail`, { ok: true, items: [] });

    await getHardwareInventorySummary();
    await getHardwareInventoryRankings();
    await getHardwareInventoryDetail({ dimension: "cpu" });

    expect(summary[0].pathname).toBe(`${BASE}/hardware-inventory/summary`);
    expect(rankings[0].pathname).toBe(`${BASE}/hardware-inventory/rankings`);
    expect(detail[0].search).toEqual({ dimension: "cpu" });
  });

  it("software inventory host drilldown encodes the agentId and forwards filters", async () => {
    const hosts = respond("get", `${BASE}/software-inventory/hosts`, { ok: true, items: [] });
    const apps = respond("get", `${BASE}/software-inventory/hosts/:agentId/apps`, { ok: true, items: [] });

    await getSoftwareInventoryHosts({ search: "office" });
    await getSoftwareInventoryHostApps("agent 1", { page: 2 });

    expect(hosts[0].search).toEqual({ search: "office" });
    expect(apps[0].pathname).toBe(`${BASE}/software-inventory/hosts/agent%201/apps`);
    expect(apps[0].search).toEqual({ page: "2" });
  });

  it("software rankings/detail mirror the hardware sub-path pattern", async () => {
    const rankings = respond("get", `${BASE}/software-inventory/rankings`, { ok: true });
    const detail = respond("get", `${BASE}/software-inventory/detail`, { ok: true, items: [] });

    await getSoftwareInventoryRankings();
    await getSoftwareInventoryDetail({ vendor: "Microsoft" });

    expect(rankings[0].pathname).toBe(`${BASE}/software-inventory/rankings`);
    expect(detail[0].search).toEqual({ vendor: "Microsoft" });
  });

  it("returns raw envelopes for the pages to unwrap", async () => {
    const envelope = { ok: true, byVendor: [] };
    respond("get", `${BASE}/software-inventory/summary`, envelope);

    await expect(getSoftwareInventorySummary()).resolves.toEqual(envelope);
  });

  it("getBrowserInventory hits the top-level browser-inventory path", async () => {
    const calls = respond("get", "/api/v1/browser-inventory", { ok: true, families: [] });
    await getBrowserInventory();
    expect(calls[0].pathname).toBe("/api/v1/browser-inventory");
  });
});
