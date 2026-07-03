// src/api/remoteControl.test.js
//
// Contract tests for the RCP client (/api/v1/remote-control).

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  getAllFileTransfers,
  getConnectableDevices,
  getRemoteControlSummary,
  getRemoteSessions,
  getSessionFileTransfers,
  startRemoteSession,
} from "./remoteControl";

const BASE = "/api/v1/remote-control";

describe("read endpoints", () => {
  it("getRemoteControlSummary returns the summary envelope untouched", async () => {
    const envelope = {
      ok: true,
      summary: { connectableDevices: 3, activeSessions: 1, sessionsLast7d: 9, avgDurationSec: 120 },
    };
    const calls = respond("get", `${BASE}/summary`, envelope);

    await expect(getRemoteControlSummary()).resolves.toEqual(envelope);
    expect(calls[0].method).toBe("GET");
  });

  it("getConnectableDevices hits /devices", async () => {
    const calls = respond("get", `${BASE}/devices`, { ok: true, items: [] });

    await getConnectableDevices();

    expect(calls[0].pathname).toBe(`${BASE}/devices`);
  });

  it("getRemoteSessions serializes filters and drops empties", async () => {
    const calls = respond("get", `${BASE}/sessions`, { ok: true, items: [] });

    await getRemoteSessions({ deviceId: "dev-1", limit: 50, status: "" });

    expect(calls[0].search).toEqual({ deviceId: "dev-1", limit: "50" });
  });

  it("getSessionFileTransfers encodes the sessionId and passes filters", async () => {
    const calls = respond("get", `${BASE}/sessions/:id/transfers`, { ok: true, total: 0, items: [] });

    await getSessionFileTransfers("sess 01", { direction: "upload" });

    expect(calls[0].pathname).toBe(`${BASE}/sessions/sess%2001/transfers`);
    expect(calls[0].search).toEqual({ direction: "upload" });
  });

  it("getAllFileTransfers hits the tenant-wide audit view with filters", async () => {
    const calls = respond("get", `${BASE}/file-transfers`, { ok: true, total: 0, items: [] });

    await getAllFileTransfers({ direction: "download", status: "completed", filename: "a.txt" });

    expect(calls[0].search).toEqual({
      direction: "download",
      status: "completed",
      filename: "a.txt",
    });
  });
});

describe("startRemoteSession", () => {
  it("POSTs { deviceId, type } and unwraps the session envelope", async () => {
    const envelope = {
      ok: true,
      sessionId: "s1",
      signalingUrl: "/api/v1/remote-control/signaling/s1",
      turnConfig: {},
    };
    const calls = respond("post", `${BASE}/sessions`, envelope);

    const res = await startRemoteSession({ deviceId: "dev-1", type: "shell" });

    expect(calls[0].body).toEqual({ deviceId: "dev-1", type: "shell" });
    expect(res).toEqual(envelope);
  });

  it("propagates the 4xx error envelope ({ error, message }) via err.code/err.body", async () => {
    respond(
      "post",
      `${BASE}/sessions`,
      { error: "RCP_NOT_ENABLED", message: "device does not advertise rcp" },
      { status: 409 }
    );

    const err = await startRemoteSession({ deviceId: "dev-1", type: "shell" }).catch((e) => e);

    expect(err.status).toBe(409);
    expect(err.code).toBe("RCP_NOT_ENABLED");
    expect(err.body.message).toBe("device does not advertise rcp");
  });

  it("501 (screen type not shipped) is classified as a temporary error — noteworthy for the UI toast path", async () => {
    // handleResponse treats every 5xx as TemporaryServerError, so the
    // deliberate 501 NOT_IMPLEMENTED for type "screen" surfaces as a
    // retryable "temporary" failure, not a distinct feature-gap error.
    respond(
      "post",
      `${BASE}/sessions`,
      { error: "NOT_IMPLEMENTED", message: "screen lands in M3" },
      { status: 501 }
    );

    const err = await startRemoteSession({ deviceId: "dev-1", type: "screen" }).catch((e) => e);

    expect(err.name).toBe("TemporaryServerError");
    expect(err.retryable).toBe(true);
    expect(err.status).toBe(501);
  });
});
