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

  it("getLatestAgentVersions asks the bulk endpoint ONCE and keeps the per-combo shape", async () => {
    // The fan-out cost four round-trips inside a client switch that already
    // fires ~28 requests. The bulk endpoint answers in one, and returns the
    // platforms the BACKEND serves — including linux, which the hard-coded
    // list here never asked for, so Linux agents could never be reported as
    // outdated.
    const calls = respond("get", "/api/v1/binaries/agent/metadata/all", {
      ok: true,
      items: [
        { platform: "windows", arch: "x64", ok: true, data: { latestVersion: "1.1.90" } },
        { platform: "linux", arch: "x64", ok: true, data: { latestVersion: "1.1.90" } },
        { platform: "macos", arch: "x64", ok: false, data: null },
      ],
    });

    const results = await getLatestAgentVersions();

    expect(calls).toHaveLength(1);
    // Downstream (AttentionPanel, FleetComposition) reads platform/arch/data,
    // so the shape must survive the change unaltered.
    expect(results).toEqual([
      { platform: "windows", arch: "x64", data: { latestVersion: "1.1.90" }, ok: true },
      { platform: "linux", arch: "x64", data: { latestVersion: "1.1.90" }, ok: true },
      { platform: "macos", arch: "x64", data: null, ok: false },
    ]);
  });

  it("falls back to the fan-out when the backend has no bulk endpoint yet", async () => {
    // The UI and the backend deploy separately. Shipping this first must not
    // blank the Hero card — a 404 means "old backend", not "no agents".
    respond("get", "/api/v1/binaries/agent/metadata/all", { error: "NOT_FOUND" }, { status: 404 });
    const combo = respond("get", "/api/v1/binaries/agent/metadata", { ok: true, version: "1.2.0" });

    const results = await getLatestAgentVersions();

    expect(combo).toHaveLength(4);
    expect(results).toHaveLength(4);
  });

  it("a 500 on the bulk endpoint propagates instead of quietly falling back", async () => {
    // Same rule the per-combo path already followed: swallowing a real outage
    // would report every agent as up to date.
    respond("get", "/api/v1/binaries/agent/metadata/all", { message: "boom" }, { status: 500 });

    const err = await getLatestAgentVersions().catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(500);
  });

  // NOTE: the three tests below register only the per-combo endpoint, so they
  // now exercise the FALLBACK path — which is exactly the behaviour they were
  // written to pin, and it must keep working while old backends are live.
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

  it("a missing platform/arch build (404) degrades to { ok:false } instead of rejecting", async () => {
    // 404 is the benign "no build published yet" case — the caller just
    // skips that combo. Only a NON-server error like this degrades.
    respond("get", "/api/v1/binaries/agent/metadata", { error: "NOT_FOUND" }, { status: 404 });

    const results = await getLatestAgentVersions();

    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.data).toBeUndefined();
    }
  });

  it("a real server error (500) is NOT swallowed — it propagates so 'no data' is distinguishable from 'backend down'", async () => {
    respond("get", "/api/v1/binaries/agent/metadata", { message: "boom" }, { status: 500 });

    const err = await getLatestAgentVersions().catch((e) => e);

    // Previously both 404 and 500 collapsed to a silent { ok:false }.
    // Now a temporary/5xx failure rejects, letting the UI/telemetry tell
    // "no build" apart from "server broken".
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(500);
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
