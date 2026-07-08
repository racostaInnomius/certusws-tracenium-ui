// src/api/patchManagement.test.js
//
// Contract tests for /api/v1/patch-management (PMP + PMv2 remediation).

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  bulkInstall,
  bulkScan,
  cancelRemediation,
  getDeviceScanItems,
  getDevicesAffectedByCheck,
  getFindings,
  getPatchDevices,
  getPatchSummary,
  getRemediation,
  getRemediationResults,
  listRemediations,
  remediate,
  getThirdPartyFleetFindings,
  getThirdPartyDeviceFindings,
  remediateThirdParty,
  listThirdPartyCatalog,
  createThirdPartyCatalog,
  updateThirdPartyCatalog,
  deleteThirdPartyCatalog,
  listMaintenanceWindows,
  createMaintenanceWindow,
  updateMaintenanceWindow,
  deleteMaintenanceWindow,
} from "./patchManagement";

const BASE = "/api/v1/patch-management";

describe("patch reads", () => {
  it("summary / devices are plain reads returning the envelope", async () => {
    const summary = respond("get", `${BASE}/summary`, { ok: true, kpis: {} });
    const devices = respond("get", `${BASE}/devices`, { ok: true, items: [] });

    await expect(getPatchSummary()).resolves.toEqual({ ok: true, kpis: {} });
    await getPatchDevices();

    expect(summary[0].pathname).toBe(`${BASE}/summary`);
    expect(devices[0].pathname).toBe(`${BASE}/devices`);
  });

  it("getDeviceScanItems encodes the agentId", async () => {
    const calls = respond("get", `${BASE}/devices/:agentId/items`, { ok: true, items: [] });

    await getDeviceScanItems("agent 01");

    expect(calls[0].pathname).toBe(`${BASE}/devices/agent%2001/items`);
  });
});

describe("bulk operations", () => {
  it("bulkInstall POSTs the full payload (severity, platform, mode, dryRun)", async () => {
    const calls = respond("post", `${BASE}/bulk-install`, { ok: true, plan: [] });
    const payload = {
      severity: ["critical", "important"],
      platform: "windows",
      mode: "install",
      dryRun: true,
    };

    await bulkInstall(payload);

    expect(calls[0].body).toEqual(payload);
  });

  it("bulkScan POSTs an empty body", async () => {
    const calls = respond("post", `${BASE}/bulk-scan`, { ok: true });

    await bulkScan();

    expect(calls[0].body).toEqual({});
  });
});

describe("PMv2 findings & remediation", () => {
  it("getFindings forwards category/severity filters as query params", async () => {
    const calls = respond("get", `${BASE}/findings`, { ok: true, items: [], totals: {} });

    await getFindings({ category: "tls", severity: "high", checkIdContains: "", limit: 100 });

    expect(calls[0].search).toEqual({ category: "tls", severity: "high", limit: "100" });
  });

  it("getDevicesAffectedByCheck encodes the checkId (dots and slashes are common)", async () => {
    const calls = respond("get", `${BASE}/findings/:checkId/devices`, { ok: true, items: [] });

    await getDevicesAffectedByCheck("tls/1.0-enabled");

    expect(calls[0].pathname).toBe(`${BASE}/findings/tls%2F1.0-enabled/devices`);
  });

  it("remediate POSTs the campaign payload untouched", async () => {
    const calls = respond("post", `${BASE}/remediate`, { ok: true, remediationId: "rm1" });
    const payload = { checkId: "smb1-enabled", mode: "dry_run", assetGroupId: "g1" };

    await remediate(payload);

    expect(calls[0].body).toEqual(payload);
  });

  it("remediation reads and cancel follow the collection/sub-path pattern", async () => {
    const list = respond("get", `${BASE}/remediations`, { ok: true, items: [] });
    const one = respond("get", `${BASE}/remediations/:id`, { ok: true });
    const results = respond("get", `${BASE}/remediations/:id/results`, { ok: true, items: [] });
    const cancel = respond("post", `${BASE}/remediations/:id/cancel`, { ok: true });

    await listRemediations({ status: "running" });
    await getRemediation("rm1");
    await getRemediationResults("rm1");
    await cancelRemediation("rm1");

    expect(list[0].search).toEqual({ status: "running" });
    expect(one[0].pathname).toBe(`${BASE}/remediations/rm1`);
    expect(results[0].pathname).toBe(`${BASE}/remediations/rm1/results`);
    expect(cancel[0].body).toEqual({});
  });
});

describe("third-party patching", () => {
  it("fetches the fleet rollup", async () => {
    const calls = respond("get", `${BASE}/third-party/findings`, { ok: true, items: [] });
    await getThirdPartyFleetFindings();
    expect(calls[0].pathname).toBe(`${BASE}/third-party/findings`);
  });

  it("fetches per-device findings, URL-encoding the agentId", async () => {
    const calls = respond("get", `${BASE}/third-party/findings/devices/:agentId`, { ok: true });
    await getThirdPartyDeviceFindings("agent/42");
    expect(calls[0].pathname).toBe(`${BASE}/third-party/findings/devices/agent%2F42`);
  });

  it("posts a remediation with the catalogId", async () => {
    const calls = respond("post", `${BASE}/third-party/remediate`, { ok: true, deployed: true }, { status: 202 });
    await remediateThirdParty(7);
    expect(calls[0].body).toEqual({ catalogId: 7 });
  });

  it("lists the catalog with a platform filter", async () => {
    const calls = respond("get", `${BASE}/third-party/catalog`, { ok: true, items: [] });
    await listThirdPartyCatalog({ platform: "windows", activeOnly: true });
    expect(calls[0].search).toEqual({ platform: "windows", activeOnly: "true" });
  });

  it("creates / updates / deletes a catalog entry", async () => {
    const create = respond("post", `${BASE}/third-party/catalog`, { ok: true }, { status: 201 });
    const update = respond("patch", `${BASE}/third-party/catalog/:id`, { ok: true });
    const del = respond("delete", `${BASE}/third-party/catalog/:id`, { ok: true });

    await createThirdPartyCatalog({ title: "7-Zip", platform: "windows", latestVersion: "23.01" });
    await updateThirdPartyCatalog(5, { latestVersion: "23.02" });
    await deleteThirdPartyCatalog(5);

    expect(create[0].body).toEqual({ title: "7-Zip", platform: "windows", latestVersion: "23.01" });
    expect(update[0].pathname).toBe(`${BASE}/third-party/catalog/5`);
    expect(update[0].body).toEqual({ latestVersion: "23.02" });
    expect(del[0].pathname).toBe(`${BASE}/third-party/catalog/5`);
  });
});
