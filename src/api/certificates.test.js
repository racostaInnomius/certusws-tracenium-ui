// src/api/certificates.test.js
//
// Contract tests for /api/v1/security/certificates.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  getCertificateActivity,
  getCertificateDetail,
  getCertificateSummary,
  listCertificateDevices,
  listDeviceCertificates,
  listDevicesWithoutActiveCertificates,
  listExpiringCertificates,
  revokeCertificate,
} from "./certificates";

const BASE = "/api/v1/security/certificates";

describe("reads", () => {
  it("getCertificateSummary hits /summary", async () => {
    const calls = respond("get", `${BASE}/summary`, { ok: true, total: 12 });

    await expect(getCertificateSummary()).resolves.toEqual({ ok: true, total: 12 });
    expect(calls[0].pathname).toBe(`${BASE}/summary`);
  });

  it("listExpiringCertificates forwards the window filter", async () => {
    const calls = respond("get", `${BASE}/expiring`, { ok: true, items: [] });

    await listExpiringCertificates({ withinDays: 30 });

    expect(calls[0].search).toEqual({ withinDays: "30" });
  });

  it("device-level lists forward filters and drop empties", async () => {
    const devices = respond("get", `${BASE}/devices`, { ok: true, items: [] });
    const without = respond("get", `${BASE}/devices/without-active`, { ok: true, items: [] });

    await listCertificateDevices({ status: "active", search: "" });
    await listDevicesWithoutActiveCertificates({ page: 1 });

    expect(devices[0].search).toEqual({ status: "active" });
    expect(without[0].search).toEqual({ page: "1" });
  });

  it("listDeviceCertificates encodes the deviceId", async () => {
    const calls = respond("get", `${BASE}/devices/:deviceId`, { ok: true, items: [] });

    await listDeviceCertificates("dev 01");

    expect(calls[0].pathname).toBe(`${BASE}/devices/dev%2001`);
  });

  it("detail and activity encode the fingerprint (colon-separated hex is typical)", async () => {
    const detail = respond("get", `${BASE}/:fingerprint`, { ok: true });
    const activity = respond("get", `${BASE}/:fingerprint/activity`, { ok: true, items: [] });

    await getCertificateDetail("ab:cd:ef");
    await getCertificateActivity("ab:cd:ef", { limit: 10 });

    expect(detail[0].pathname).toBe(`${BASE}/ab%3Acd%3Aef`);
    expect(activity[0].pathname).toBe(`${BASE}/ab%3Acd%3Aef/activity`);
    expect(activity[0].search).toEqual({ limit: "10" });
  });
});

describe("revocation", () => {
  it("revokeCertificate POSTs the reason body to /:fingerprint/revoke (defaults to {})", async () => {
    const calls = respond("post", `${BASE}/:fingerprint/revoke`, { ok: true });

    await revokeCertificate("ab:cd", { reason: "compromised" });
    await revokeCertificate("ab:cd");

    expect(calls[0].pathname).toBe(`${BASE}/ab%3Acd/revoke`);
    expect(calls[0].body).toEqual({ reason: "compromised" });
    expect(calls[1].body).toEqual({});
  });
});
