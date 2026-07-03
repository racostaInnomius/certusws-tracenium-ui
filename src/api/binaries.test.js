// src/api/binaries.test.js
//
// Contract tests for /api/v1/binaries (agent installer catalog).

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import { getAgentMetadata, listAgentVersions } from "./binaries";

const BASE = "/api/v1/binaries";

describe("agent binaries", () => {
  it("getAgentMetadata defaults to platform=windows arch=x64", async () => {
    const calls = respond("get", `${BASE}/agent/metadata`, { ok: true, version: "1.1.20" });

    await getAgentMetadata();

    expect(calls[0].search).toEqual({ platform: "windows", arch: "x64" });
  });

  it("getAgentMetadata forwards explicit platform/arch", async () => {
    const calls = respond("get", `${BASE}/agent/metadata`, { ok: true });

    await getAgentMetadata({ platform: "macos", arch: "arm64" });

    expect(calls[0].search).toEqual({ platform: "macos", arch: "arm64" });
  });

  it("listAgentVersions uses the same defaulted query contract", async () => {
    const calls = respond("get", `${BASE}/agent/versions`, { ok: true, items: [] });

    await listAgentVersions();

    expect(calls[0].pathname).toBe(`${BASE}/agent/versions`);
    expect(calls[0].search).toEqual({ platform: "windows", arch: "x64" });
  });
});
