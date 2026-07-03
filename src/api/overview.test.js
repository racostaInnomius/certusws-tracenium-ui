// src/api/overview.test.js
//
// Contract tests for the Overview aggregator. Focus areas:
// - query building of the composed reads,
// - which bundle slots swallow errors (deliberate fallbacks) vs
//   which ones surface a rejected allSettled entry.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  fetchOverviewBundle,
  getLatestAgentVersions,
  getPluginCoverageDevices,
  getRecentEnrollments,
} from "./overview";

describe("composed reads", () => {
  it("getRecentEnrollments reuses the hosts list with pagination + sort params", async () => {
    const calls = respond("get", "/api/v1/dashboard/hosts", { ok: true, items: [] });

    await getRecentEnrollments(5);

    expect(calls[0].search).toEqual({
      page: "1",
      pageSize: "5",
      sortBy: "collectedAtUtc",
      sortDir: "desc",
    });
  });

  it("getPluginCoverageDevices lowercases, trims and encodes the plugin id", async () => {
    const calls = respond("get", "/api/v1/dashboard/plugin-coverage/:plugin/devices", { ok: true });

    await getPluginCoverageDevices("  SCP  ");

    expect(calls[0].pathname).toBe("/api/v1/dashboard/plugin-coverage/scp/devices");
  });

  it("getLatestAgentVersions fans out over macos/windows x arm64/x64 and swallows per-combo failures", async () => {
    const calls = respond("get", "/api/v1/binaries/agent/metadata", { ok: true, version: "1.2.0" });

    const results = await getLatestAgentVersions();

    // 4 combos, each a distinct URL (no cache collisions).
    expect(calls).toHaveLength(4);
    const combos = calls.map((c) => `${c.search.platform}/${c.search.arch}`).sort();
    expect(combos).toEqual(["macos/arm64", "macos/x64", "windows/arm64", "windows/x64"]);

    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.ok).toBe(true);
      expect(r.data).toEqual({ ok: true, version: "1.2.0" });
    }
  });

  it("a missing platform/arch build resolves to { ok:false } instead of rejecting (swallowed by design)", async () => {
    respond("get", "/api/v1/binaries/agent/metadata", { error: "NOT_FOUND" }, { status: 404 });

    const results = await getLatestAgentVersions();

    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.data).toBeUndefined();
      // The original error is discarded entirely — callers cannot tell
      // a 404 (no build) from a 500 (backend down). Documented hallazgo.
    }
  });
});

describe("fetchOverviewBundle", () => {
  function stubHappyEndpoints() {
    respond("get", "/api/v1/dashboard/hardware-inventory/rankings", { ok: true });
    respond("get", "/api/v1/security/audit/summary", { ok: true });
    respond("get", "/api/v1/security/certificates/summary", { ok: true });
    respond("get", "/api/v1/security/certificates/expiring", { ok: true, items: [] });
    respond("get", "/api/v1/security/compliance/summary", { ok: true });
    respond("get", "/api/v1/security/audit/timeseries", { ok: true, buckets: [] });
    respond("get", "/api/v1/orchestrator/jobs/timeseries", { ok: true, buckets: [] });
    respond("get", "/api/v1/binaries/agent/metadata", { ok: true, version: "1.2.0" });
    respond("get", "/api/v1/dashboard/hosts", { ok: true, items: [] });
    respond("get", "/api/v1/orchestrator/devices-connected", { ok: true, items: [] });
    respond("get", "/api/v1/dashboard/agent-versions", { ok: true, byVersion: [] });
    respond("get", "/api/v1/security/compliance/devices", { ok: true, items: [] });
    respond("get", "/api/v1/dashboard/plugin-coverage", { ok: true, byPlugin: [] });
    respond("get", "/api/v1/security/compliance/fleet-timeseries", { ok: true, buckets: [] });
  }

  it("returns one allSettled slot per data source, keyed by name", async () => {
    stubHappyEndpoints();
    respond("get", "/api/v1/dashboard/summary", { ok: true, totals: { devices: 4 } });
    respond("get", "/api/v1/alerts/events", { ok: true, items: [{ id: "e1" }] });
    respond("get", "/api/v1/alerts/unread-count", { ok: true, count: 2 });

    const { results } = await fetchOverviewBundle();

    expect(Object.keys(results).sort()).toEqual(
      [
        "agentVersions",
        "alertEvents",
        "alertsUnread",
        "auditSummary",
        "auditTimeseries",
        "certsSummary",
        "complianceSummary",
        "connectedDevices",
        "dashboardSummary",
        "devicePosture",
        "expiringCerts",
        "fleetComplianceTimeseries",
        "hardwareRankings",
        "jobsTimeseries",
        "latestVersions",
        "pluginCoverage",
        "recentHosts",
      ].sort()
    );

    for (const [key, slot] of Object.entries(results)) {
      expect(slot.status, `slot ${key}`).toBe("fulfilled");
    }
    expect(results.dashboardSummary.value).toEqual({ ok: true, totals: { devices: 4 } });
    expect(results.alertEvents.value).toEqual({ ok: true, items: [{ id: "e1" }] });
  });

  it("shielded slots swallow backend failures into fallbacks; unshielded slots reject", async () => {
    stubHappyEndpoints();
    // Unshielded slot fails hard → rejected entry the page must handle.
    respond("get", "/api/v1/dashboard/summary", { message: "boom" }, { status: 500 });
    // Shielded slots fail → built-in fallback values, still fulfilled.
    respond("get", "/api/v1/alerts/events", { message: "boom" }, { status: 500 });
    respond("get", "/api/v1/alerts/unread-count", { message: "boom" }, { status: 500 });
    respond("get", "/api/v1/security/compliance/devices", { message: "boom" }, { status: 500 });
    respond("get", "/api/v1/dashboard/plugin-coverage", { message: "boom" }, { status: 500 });
    respond("get", "/api/v1/security/compliance/fleet-timeseries", { message: "boom" }, { status: 500 });

    const { results } = await fetchOverviewBundle();

    expect(results.dashboardSummary.status).toBe("rejected");

    expect(results.alertEvents.status).toBe("fulfilled");
    expect(results.alertEvents.value).toEqual({ items: [] });
    expect(results.alertsUnread.status).toBe("fulfilled");
    expect(results.alertsUnread.value).toEqual({ count: 0 });
    expect(results.devicePosture.value).toEqual({ items: [] });
    expect(results.pluginCoverage.value).toEqual({ total: 0, byPlugin: [] });
    expect(results.fleetComplianceTimeseries.value).toEqual({ windowDays: 30, buckets: [] });
  });
});
