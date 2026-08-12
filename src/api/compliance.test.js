// src/api/compliance.test.js
//
// Contract tests for the SCP client (/api/v1/security/compliance):
// reads, finding lifecycle, bulk ops and the export URL builders.

import { describe, expect, it } from "vitest";

import { API_BASE, respond } from "../test/msw/server";
import {
  acknowledgeFinding,
  buildFindingsCsvUrl,
  buildFindingsPdfUrl,
  bulkFindingOp,
  getComplianceCatalog,
  getComplianceSettings,
  getComplianceSummary,
  getDeviceDetail,
  getDeviceFindingsDiff,
  getDeviceFleetRanking,
  getDevicePosture,
  getDeviceTimeseries,
  getFleetComplianceTimeseries,
  getFrameworkComplianceTimeseries,
  getFindingHistory,
  getFrameworkSummary,
  getCategorySummary,
  getCategoryDevices,
  getFrameworks,
  getTimeToCloseSummary,
  revokeFindingAcknowledgement,
  updateComplianceSettings,
  updateFindingRemediationStatus,
} from "./compliance";

const BASE = "/api/v1/security/compliance";

describe("read endpoints", () => {
  it("getComplianceSummary returns the raw { ok, ... } envelope", async () => {
    const envelope = { ok: true, avgScore: 71, statusBreakdown: {} };
    respond("get", `${BASE}/summary`, envelope);

    await expect(getComplianceSummary()).resolves.toEqual(envelope);
  });

  it("getDeviceDetail encodes the agentId", async () => {
    const calls = respond("get", `${BASE}/devices/:agentId`, { ok: true });

    await getDeviceDetail("agent/01 test");

    expect(calls[0].pathname).toBe(`${BASE}/devices/agent%2F01%20test`);
  });

  it("getDeviceTimeseries defaults windowDays=30 and sends it as query", async () => {
    const calls = respond("get", `${BASE}/devices/:agentId/timeseries`, { ok: true, points: [] });

    await getDeviceTimeseries("agent-1");
    await getDeviceTimeseries("agent-1", 90);

    expect(calls[0].search).toEqual({ windowDays: "30" });
    expect(calls[1].search).toEqual({ windowDays: "90" });
  });

  it("getTimeToCloseSummary defaults windowDays=90", async () => {
    const calls = respond("get", `${BASE}/time-to-close`, { ok: true, buckets: [] });

    await getTimeToCloseSummary();

    expect(calls[0].search).toEqual({ windowDays: "90" });
  });

  it("getDeviceFindingsDiff omits `vs` when not provided", async () => {
    const calls = respond("get", `${BASE}/devices/:agentId/diff`, { ok: true, diff: {} });

    await getDeviceFindingsDiff("agent-1");
    await getDeviceFindingsDiff("agent-1", { vs: "2026-06-01T00:00:00Z" });

    expect(calls[0].searchString).toBe("");
    expect(calls[1].search).toEqual({ vs: "2026-06-01T00:00:00Z" });
  });

  it("catalog / frameworks / posture reads hit their paths with filters", async () => {
    const catalog = respond("get", `${BASE}/catalog`, { ok: true, items: [] });
    const frameworks = respond("get", `${BASE}/frameworks`, { ok: true, items: [] });
    const frameworkSummary = respond("get", `${BASE}/framework-summary`, { ok: true, items: [] });
    const categorySummary = respond("get", `${BASE}/category-summary`, { ok: true, items: [] });
    const categoryDevices = respond("get", `${BASE}/category-summary/:category/devices`, { ok: true, items: [] });
    const posture = respond("get", `${BASE}/devices`, { ok: true, items: [] });

    await getComplianceCatalog({ search: "smb" });
    await getFrameworks();
    await getFrameworkSummary();
    await getCategorySummary();
    await getCategoryDevices("network_sharing");
    await getDevicePosture({ framework: "cis-win11" });

    expect(catalog[0].search).toEqual({ search: "smb" });
    expect(frameworks[0].pathname).toBe(`${BASE}/frameworks`);
    expect(frameworkSummary[0].pathname).toBe(`${BASE}/framework-summary`);
    expect(categorySummary[0].pathname).toBe(`${BASE}/category-summary`);
    expect(categoryDevices[0].pathname).toBe(`${BASE}/category-summary/network_sharing/devices`);
    expect(posture[0].search).toEqual({ framework: "cis-win11" });
  });

  it("getComplianceSettings reads the settings envelope", async () => {
    const envelope = { ok: true, settings: { effective: {}, overrides: {} } };
    respond("get", `${BASE}/settings`, envelope);

    await expect(getComplianceSettings()).resolves.toEqual(envelope);
  });

  it("getDeviceFleetRanking hits the ranking sub-path", async () => {
    const calls = respond("get", `${BASE}/devices/:agentId/ranking`, { ok: true, ranking: {} });

    await getDeviceFleetRanking("agent-1");

    expect(calls[0].pathname).toBe(`${BASE}/devices/agent-1/ranking`);
  });
});

describe("finding lifecycle", () => {
  it("acknowledgeFinding POSTs { note: null } when no note is given", async () => {
    const calls = respond("post", `${BASE}/findings/:id/acknowledge`, { ok: true });

    await acknowledgeFinding("f-1");
    await acknowledgeFinding("f-1", { note: "seen it" });

    expect(calls[0].body).toEqual({ note: null });
    expect(calls[1].body).toEqual({ note: "seen it" });
  });

  it("acknowledgeFinding sends acknowledgedUntil only when provided", async () => {
    const calls = respond("post", `${BASE}/findings/:id/acknowledge`, { ok: true });

    await acknowledgeFinding("f-1"); // omitted -> key absent
    await acknowledgeFinding("f-1", { acknowledgedUntil: "2026-09-30T00:00:00.000Z" });
    await acknowledgeFinding("f-1", { acknowledgedUntil: null }); // explicit indefinite

    expect("acknowledgedUntil" in calls[0].body).toBe(false);
    expect(calls[1].body).toEqual({
      note: null,
      acknowledgedUntil: "2026-09-30T00:00:00.000Z"
    });
    expect(calls[2].body).toEqual({ note: null, acknowledgedUntil: null });
  });

  it("revokeFindingAcknowledgement hits the /acknowledge/revoke sub-path", async () => {
    const calls = respond("post", `${BASE}/findings/:id/acknowledge/revoke`, { ok: true });

    await revokeFindingAcknowledgement("f-1", { note: "changed my mind" });

    expect(calls[0].pathname).toBe(`${BASE}/findings/f-1/acknowledge/revoke`);
    expect(calls[0].body).toEqual({ note: "changed my mind" });
  });

  it("updateFindingRemediationStatus PUTs { status, note }", async () => {
    const calls = respond("put", `${BASE}/findings/:id/remediation-status`, { ok: true });

    await updateFindingRemediationStatus("f-1", { status: "in_progress" });

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toEqual({ status: "in_progress", note: null });
  });

  it("lifecycle rejections (INVALID_TRANSITION) still throw on non-2xx despite the module comment", async () => {
    // The module docstring says these helpers "do NOT throw on
    // non-200" — that is only true if the backend answers 200 with
    // { ok: false }. An actual HTTP 4xx envelope DOES throw via
    // handleResponse. Documented here so the contract is explicit.
    respond(
      "put",
      `${BASE}/findings/:id/remediation-status`,
      { ok: false, code: "INVALID_TRANSITION", allowedTransitions: ["open"] },
      { status: 409 }
    );

    const err = await updateFindingRemediationStatus("f-1", { status: "remediated" }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.body.allowedTransitions).toEqual(["open"]);
  });

  it("a 200 + { ok:false } envelope resolves (this is the non-throwing path the UI branches on)", async () => {
    respond(
      "put",
      `${BASE}/findings/:id/remediation-status`,
      { ok: false, code: "FINDING_CLOSED" },
      { status: 200 }
    );

    await expect(
      updateFindingRemediationStatus("f-1", { status: "remediated" })
    ).resolves.toEqual({ ok: false, code: "FINDING_CLOSED" });
  });

  it("getFindingHistory defaults limit=200", async () => {
    const calls = respond("get", `${BASE}/findings/:id/history`, { ok: true, items: [] });

    await getFindingHistory("f-1");

    expect(calls[0].search).toEqual({ limit: "200" });
  });

  it("bulkFindingOp POSTs to the literal findings:bulk path with the op body", async () => {
    // The `:` in the path is literal (Google AIP custom-method style),
    // so match by RegExp — path-to-regexp would read `:bulk` as a param.
    const calls = respond("post", /\/security\/compliance\/findings:bulk$/, { ok: true, summary: {} });

    await bulkFindingOp({ op: "change_status", findingIds: ["f-1", "f-2"], newStatus: "risk_accepted" });

    expect(calls[0].pathname).toBe(`${BASE}/findings:bulk`);
    expect(calls[0].body).toEqual({
      op: "change_status",
      findingIds: ["f-1", "f-2"],
      newStatus: "risk_accepted",
      note: null,
    });
  });

  it("bulkFindingOp forwards acknowledgedUntil for a bulk acknowledge", async () => {
    const calls = respond("post", /\/security\/compliance\/findings:bulk$/, { ok: true, summary: {} });

    await bulkFindingOp({ op: "acknowledge", findingIds: ["f-1"] }); // key absent
    await bulkFindingOp({
      op: "acknowledge",
      findingIds: ["f-1"],
      acknowledgedUntil: "2026-09-30T00:00:00.000Z",
    });

    expect("acknowledgedUntil" in calls[0].body).toBe(false);
    expect(calls[1].body.acknowledgedUntil).toBe("2026-09-30T00:00:00.000Z");
  });
});

describe("settings", () => {
  it("updateComplianceSettings PUTs the partial patch untouched", async () => {
    const calls = respond("put", `${BASE}/settings`, { ok: true, settings: {} });

    await updateComplianceSettings({ minScoreCompliant: 80, staleAfterDays: null });

    expect(calls[0].body).toEqual({ minScoreCompliant: 80, staleAfterDays: null });
  });
});

describe("export URL builders (pure functions)", () => {
  it("buildFindingsCsvUrl serializes framework and includeClosed", () => {
    expect(buildFindingsCsvUrl({ framework: "cis-win11", includeClosed: true, maxRows: 500 })).toBe(
      `${API_BASE}/api/v1/security/compliance/export/findings.csv?framework=cis-win11&includeClosed=true&maxRows=500`
    );
    // includeClosed defaults to false and is still emitted explicitly.
    expect(buildFindingsCsvUrl()).toBe(
      `${API_BASE}/api/v1/security/compliance/export/findings.csv?includeClosed=false`
    );
  });

  it("buildFindingsPdfUrl mirrors the CSV builder with maxDevices", () => {
    expect(buildFindingsPdfUrl({ framework: "nist-csf", maxDevices: 10 })).toBe(
      `${API_BASE}/api/v1/security/compliance/export/findings.pdf?framework=nist-csf&includeClosed=false&maxDevices=10`
    );
  });

  // ── Regression guard for the SPA-relative export bug ──
  //
  // The docstring promises "the absolute URL the browser can hit
  // directly". Previously the builders returned a SERVER-RELATIVE path,
  // so the anchor in SecurityCompliance.jsx resolved it against the SPA
  // origin (portal.tracenium.com, Azure Static Web Apps). That host has
  // NO /api proxy and its navigationFallback rewrites unknown routes to
  // /index.html — so "Export CSV/PDF" downloaded the SPA's index.html
  // instead of the report. Same class of bug already fixed for WebSocket
  // URLs in http.js#getApiWsUrl. Fixed by prefixing API_BASE.
  it("export URLs are absolute against VITE_API_BASE, not SPA-relative", () => {
    // Absolute (starts with the API origin), parseable as a URL, and the
    // origin is exactly the configured API base — not the SPA origin.
    for (const url of [buildFindingsCsvUrl(), buildFindingsPdfUrl()]) {
      expect(url).toMatch(new RegExp(`^${API_BASE}`));
      expect(new URL(url).origin).toBe(new URL(API_BASE).origin);
    }
  });

  it("export URLs preserve query params after the absolute base prefix", () => {
    const csv = new URL(
      buildFindingsCsvUrl({ framework: "cis-win11", includeClosed: true, maxRows: 500 })
    );
    expect(csv.origin).toBe(new URL(API_BASE).origin);
    expect(csv.pathname).toBe("/api/v1/security/compliance/export/findings.csv");
    expect(csv.searchParams.get("framework")).toBe("cis-win11");
    expect(csv.searchParams.get("includeClosed")).toBe("true");
    expect(csv.searchParams.get("maxRows")).toBe("500");

    const pdf = new URL(buildFindingsPdfUrl({ framework: "nist-csf", maxDevices: 10 }));
    expect(pdf.pathname).toBe("/api/v1/security/compliance/export/findings.pdf");
    expect(pdf.searchParams.get("framework")).toBe("nist-csf");
    expect(pdf.searchParams.get("includeClosed")).toBe("false");
    expect(pdf.searchParams.get("maxDevices")).toBe("10");
  });

  it("getFleetComplianceTimeseries passes the window in days", async () => {
    const calls = respond("get", "/api/v1/security/compliance/fleet-timeseries", { ok: true, buckets: [] });
    await getFleetComplianceTimeseries(90);
    expect(calls[0].pathname).toBe("/api/v1/security/compliance/fleet-timeseries");
    expect(calls[0].search).toEqual({ windowDays: "90" });
  });

  it("getFrameworkComplianceTimeseries hits framework-timeseries with the window", async () => {
    const calls = respond("get", "/api/v1/security/compliance/framework-timeseries", { ok: true, frameworks: [], buckets: [] });
    await getFrameworkComplianceTimeseries(60);
    expect(calls[0].pathname).toBe("/api/v1/security/compliance/framework-timeseries");
    expect(calls[0].search).toEqual({ windowDays: "60" });
  });
});
