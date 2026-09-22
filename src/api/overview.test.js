// src/api/overview.test.js
//
// Contract tests for the Overview aggregator. Focus areas:
// - query building of the composed reads,
// - which bundle slots swallow errors (deliberate fallbacks) vs
//   which ones surface a rejected allSettled entry.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  fetchOverviewCore,
  fetchOverviewOperations,
  fetchOverviewSecurity,
  getExpiringCertificates,
  getLatestAgentVersions,
} from "./overview";

describe("composed reads", () => {
  it("getExpiringCertificates manda `days`, que es lo que lee el controlador", async () => {
    // Mandaba `withinDays`: el backend lo ignoraba y aplicaba siempre su
    // defecto de 30, así que cualquier otra ventana se perdía en silencio.
    const calls = respond("get", "/api/v1/security/certificates/expiring", { ok: true, count: 0 });

    await getExpiringCertificates(14);

    expect(calls[0].search).toEqual({ days: "14" });
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

describe("loaders por bloque del Overview", () => {
  let alertCalls;
  let auditCalls;
  function stubCore() {
    respond("get", "/api/v1/dashboard/summary", { fleetDevices: 4 });
    respond("get", "/api/v1/orchestrator/devices-connected", { ok: true, count: 2 });
    respond("get", "/api/v1/binaries/agent/metadata/all", { ok: true, items: [] });
    respond("get", "/api/v1/dashboard/agent-versions", { ok: true, byVersion: [] });
    respond("get", "/api/v1/dashboard/hardware-inventory/summary", { fleet: { total: 4, composition: {} } });
    respond("get", "/api/v1/orchestrator/jobs/timeseries", { ok: true, buckets: [] });
    auditCalls = respond("get", "/api/v1/security/audit/timeseries", { ok: true, buckets: [] });
    respond("get", "/api/v1/security/certificates/expiring", { ok: true, count: 0 });
    alertCalls = respond("get", "/api/v1/alerts/events", { ok: true, items: [{ id: "e1" }] });
    respond("get", "/api/v1/alerts/unread-count", { ok: true, count: 2 });
    respond("get", "/api/v1/reports/runs", { ok: true, total: 3, runs: [] });
    respond("get", "/api/v1/reports/schedules", { ok: true, items: [] });
  }

  it("⭐ bloque 1 sin SDP concedido NO pide nada de Software Delivery", async () => {
    stubCore();
    const sdp = respond("get", /\/api\/v1\/software-delivery\/.*/, { ok: true });

    const results = await fetchOverviewCore({ sdp: false });

    expect(sdp).toHaveLength(0);
    expect(Object.keys(results).sort()).toEqual([
      "agentVersions", "alertsUnread", "auditTimeseries",
      "connectedDevices", "dashboardSummary", "expiringCerts", "hardwareSummary",
      "jobsTimeseries", "latestVersions", "reportRuns", "reportSchedules",
    ]);
    // "Latest alerts" salió del Overview (la campana ya lo dice): no se piden.
    expect(alertCalls).toHaveLength(0);
    // Carril admin: el que abre la página de Audit al pulsar la gráfica.
    expect(auditCalls[0].search).toEqual({ window: "7d", lane: "admin" });
    for (const [key, slot] of Object.entries(results)) {
      expect(slot.status, `slot ${key}`).toBe("fulfilled");
    }
  });

  it("bloque 1 con SDP pide la serie de 30 días y las campañas en marcha y en cola", async () => {
    stubCore();
    const ts = respond("get", "/api/v1/software-delivery/analytics/timeseries", { ok: true, buckets: [] });
    const deps = respond("get", "/api/v1/software-delivery/deployments", { ok: true, items: [] });

    const results = await fetchOverviewCore({ sdp: true });

    expect(ts[0].search).toEqual({ window: "30d" });
    expect(deps.map((c) => c.search.status).sort()).toEqual(["queued", "running"]);
    expect(results.sdpRunning.status).toBe("fulfilled");
    expect(results.sdpQueued.status).toBe("fulfilled");
  });

  it("⭐ bloque 2 sólo pide lo del plugin concedido (RCP sin SCP no toca compliance)", async () => {
    const compliance = respond("get", /\/api\/v1\/security\/compliance\/.*/, { ok: true });
    respond("get", "/api/v1/remote-control/summary", { ok: true, summary: { readyNow: 1 } });

    const results = await fetchOverviewSecurity({ scp: false, rcp: true });

    expect(compliance).toHaveLength(0);
    expect(Object.keys(results)).toEqual(["rcpSummary"]);
  });

  it("bloque 3 pide PMP y CDP por separado", async () => {
    const pmp = respond("get", "/api/v1/patch-management/summary", { ok: true, summary: {} });
    const cdp = respond("get", "/api/v1/cdp/summary", { ok: true, summary: {} });

    const results = await fetchOverviewOperations({ pmp: true, cdp: false });

    expect(pmp).toHaveLength(1);
    expect(cdp).toHaveLength(0);
    expect(Object.keys(results)).toEqual(["patchSummary"]);
  });

  it("los slots blindados caen a su valor de reserva; los demás rechazan", async () => {
    stubCore();
    respond("get", "/api/v1/dashboard/summary", { message: "boom" }, { status: 500 });
    respond("get", "/api/v1/alerts/events", { message: "boom" }, { status: 500 });
    respond("get", "/api/v1/alerts/unread-count", { message: "boom" }, { status: 500 });
    respond("get", "/api/v1/security/compliance/devices", { message: "boom" }, { status: 500 });
    respond("get", "/api/v1/security/compliance/summary", { ok: true, summary: {} });
    respond("get", "/api/v1/security/compliance/fleet-timeseries", { message: "boom" }, { status: 500 });

    const core = await fetchOverviewCore();
    const security = await fetchOverviewSecurity({ scp: true });

    expect(core.dashboardSummary.status).toBe("rejected");
    expect(core.alertsUnread.value).toEqual({ count: 0 });
    expect(security.devicePosture.value).toEqual({ items: [] });
    expect(security.fleetComplianceTimeseries.value).toEqual({ windowDays: 30, buckets: [] });
  });
});
