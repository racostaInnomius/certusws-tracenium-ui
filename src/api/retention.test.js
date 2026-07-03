// src/api/retention.test.js
//
// Contract tests for /api/v1/retention.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  getRetentionPolicy,
  getRetentionStats,
  runRetention,
  updateRetentionPolicy,
} from "./retention";

const BASE = "/api/v1/retention";

describe("reads", () => {
  it("getRetentionStats returns the { ok, policy, sizes } envelope", async () => {
    const envelope = { ok: true, policy: { enabled: true }, sizes: { perTable: [] } };
    respond("get", `${BASE}/stats`, envelope);

    await expect(getRetentionStats()).resolves.toEqual(envelope);
  });

  it("getRetentionPolicy hits /policy", async () => {
    const calls = respond("get", `${BASE}/policy`, { ok: true, policy: {} });

    await getRetentionPolicy();

    expect(calls[0].pathname).toBe(`${BASE}/policy`);
  });
});

describe("writes", () => {
  it("updateRetentionPolicy PUTs the partial patch only", async () => {
    const calls = respond("put", `${BASE}/policy`, { ok: true });

    await updateRetentionPolicy({ enabled: false });

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toEqual({ enabled: false });
  });

  it("runRetention defaults to dry=true and POSTs an empty body", async () => {
    const calls = respond("post", `${BASE}/run`, { ok: true, summary: {} });

    await runRetention();

    expect(calls[0].search).toEqual({ dry: "true" });
    expect(calls[0].body).toEqual({});
  });

  it("runRetention({ dryRun: false }) sends dry=false (the destructive run)", async () => {
    const calls = respond("post", `${BASE}/run`, { ok: true, summary: {} });

    await runRetention({ dryRun: false });

    expect(calls[0].search).toEqual({ dry: "false" });
  });
});
