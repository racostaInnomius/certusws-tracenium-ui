// src/api/devices.test.js
//
// Contract tests for the device lifecycle helpers (decommission/restore).

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  createDeviceDecommissionJob,
  getDeviceDecommissionJob,
  restoreDevice,
} from "./devices";

const DEVICES = "/api/v1/devices";
const JOBS = "/api/v1/device-decommission-jobs";

describe("decommission jobs", () => {
  it("createDeviceDecommissionJob POSTs to the device sub-path with the payload (defaults to {})", async () => {
    const calls = respond("post", `${DEVICES}/:deviceId/decommission-jobs`, { ok: true, jobId: "j1", status: "QUEUED" });

    await createDeviceDecommissionJob("dev 1", { reason: "retired" });
    await createDeviceDecommissionJob("dev 1");

    expect(calls[0].pathname).toBe(`${DEVICES}/dev%201/decommission-jobs`);
    expect(calls[0].body).toEqual({ reason: "retired" });
    expect(calls[1].body).toEqual({});
  });

  it("rejects locally when deviceId is missing (no network call)", async () => {
    await expect(createDeviceDecommissionJob()).rejects.toThrow(/deviceId is required/);
    await expect(restoreDevice("")).rejects.toThrow(/deviceId is required/);
  });

  it("getDeviceDecommissionJob polls the job resource and rejects without jobId", async () => {
    const calls = respond("get", `${JOBS}/:jobId`, { ok: true, status: "RUNNING" });

    await expect(getDeviceDecommissionJob("job-1")).resolves.toEqual({ ok: true, status: "RUNNING" });
    expect(calls[0].pathname).toBe(`${JOBS}/job-1`);

    await expect(getDeviceDecommissionJob()).rejects.toThrow(/jobId is required/);
  });
});

describe("restore", () => {
  it("restoreDevice POSTs to /:deviceId/restore", async () => {
    const calls = respond("post", `${DEVICES}/:deviceId/restore`, { ok: true });

    await restoreDevice("dev-1", { note: "back in service" });

    expect(calls[0].pathname).toBe(`${DEVICES}/dev-1/restore`);
    expect(calls[0].body).toEqual({ note: "back in service" });
  });
});
