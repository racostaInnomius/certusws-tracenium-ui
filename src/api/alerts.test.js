// src/api/alerts.test.js
//
// Contract tests for /api/v1/alerts.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  createAlertRule,
  deleteAlertRule,
  getAlertEvents,
  getAlertRules,
  getAlertsUnreadCount,
  markAllAlertsSeen,
  patchAlertRule,
} from "./alerts";

const BASE = "/api/v1/alerts";

describe("rules", () => {
  it("getAlertRules returns the raw envelope", async () => {
    const envelope = { ok: true, templates: [], rules: [] };
    respond("get", `${BASE}/rules`, envelope);

    await expect(getAlertRules()).resolves.toEqual(envelope);
  });

  it("createAlertRule POSTs the rule body untouched", async () => {
    const calls = respond("post", `${BASE}/rules`, { ok: true, id: "r1" });
    const body = { templateId: "tpl-1", name: "CPU high", severity: "warning", source: "amp", criteria: {} };

    await createAlertRule(body);

    expect(calls[0].body).toEqual(body);
  });

  it("patchAlertRule PATCHes only the changed fields and encodes the id", async () => {
    const calls = respond("patch", `${BASE}/rules/:id`, { ok: true });

    await patchAlertRule("r 1", { enabled: false });

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].pathname).toBe(`${BASE}/rules/r%201`);
    expect(calls[0].body).toEqual({ enabled: false });
  });

  it("deleteAlertRule issues DELETE on the rule path", async () => {
    const calls = respond("delete", `${BASE}/rules/:id`, { ok: true });

    await deleteAlertRule("r1");

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].pathname).toBe(`${BASE}/rules/r1`);
  });
});

describe("feed & badge", () => {
  it("getAlertEvents forwards feed filters and drops empties", async () => {
    const calls = respond("get", `${BASE}/events`, { ok: true, items: [] });

    await getAlertEvents({ limit: 5, severity: "critical", ruleId: "" });

    expect(calls[0].search).toEqual({ limit: "5", severity: "critical" });
  });

  it("getAlertsUnreadCount hits /unread-count", async () => {
    const calls = respond("get", `${BASE}/unread-count`, { ok: true, count: 3 });

    await expect(getAlertsUnreadCount()).resolves.toEqual({ ok: true, count: 3 });
    expect(calls[0].pathname).toBe(`${BASE}/unread-count`);
  });

  it("markAllAlertsSeen POSTs an empty body", async () => {
    const calls = respond("post", `${BASE}/mark-all-seen`, { ok: true });

    await markAllAlertsSeen();

    expect(calls[0].body).toEqual({});
  });
});
