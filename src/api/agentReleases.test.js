// src/api/agentReleases.test.js
//
// Contract tests for /api/v1/agent-releases (Tracenium agent installer
// catalog — distinct from the SDP module after the 2026-05-01 rename).

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  createAgentRelease,
  deleteAgentRelease,
  getAgentReleaseById,
  listAgentReleases,
  resolveAgentReleaseDownload,
  updateAgentRelease,
} from "./agentReleases";

const BASE = "/api/v1/agent-releases";

describe("agent releases", () => {
  it("listAgentReleases forwards filters as query params", async () => {
    const calls = respond("get", BASE, { ok: true, items: [] });

    await listAgentReleases({ platform: "windows", channel: "stable" });

    expect(calls[0].search).toEqual({ platform: "windows", channel: "stable" });
  });

  it("getAgentReleaseById interpolates the id normally", async () => {
    const calls = respond("get", `${BASE}/:id`, { ok: true });

    await getAgentReleaseById("rel-1");

    expect(calls[0].pathname).toBe(`${BASE}/rel-1`);
  });

  it("encodes special characters in the release id path param", async () => {
    // Consistency with sibling modules (softwareDelivery/assetGroups/etc.):
    // a path id with `/` or spaces must be percent-encoded.
    const byId = respond("get", /\/api\/v1\/agent-releases\/.+/, { ok: true });
    const update = respond("put", /\/api\/v1\/agent-releases\/.+/, { ok: true });
    const del = respond("delete", /\/api\/v1\/agent-releases\/.+/, { ok: true });

    await getAgentReleaseById("a/b c");
    await updateAgentRelease("a/b c", { channel: "beta" });
    await deleteAgentRelease("a/b c");

    expect(byId[0].pathname).toBe(`${BASE}/a%2Fb%20c`);
    expect(update[0].pathname).toBe(`${BASE}/a%2Fb%20c`);
    expect(del[0].pathname).toBe(`${BASE}/a%2Fb%20c`);
  });

  it("create/update/delete follow the standard REST shape", async () => {
    const create = respond("post", BASE, { ok: true, id: "rel-9" });
    const update = respond("put", `${BASE}/:id`, { ok: true });
    const del = respond("delete", `${BASE}/:id`, { ok: true });

    const payload = { version: "1.2.0", platform: "windows", arch: "x64" };
    await createAgentRelease(payload);
    await updateAgentRelease("rel-9", { channel: "beta" });
    await deleteAgentRelease("rel-9");

    expect(create[0].body).toEqual(payload);
    expect(update[0].method).toBe("PUT");
    expect(update[0].body).toEqual({ channel: "beta" });
    expect(del[0].method).toBe("DELETE");
  });

  it("resolveAgentReleaseDownload GETs the backend-provided path verbatim", async () => {
    const calls = respond("get", `${BASE}/rel-1/download-info`, { ok: true, url: "https://blob/..." });

    await resolveAgentReleaseDownload(`${BASE}/rel-1/download-info`);

    expect(calls[0].pathname).toBe(`${BASE}/rel-1/download-info`);
  });
});
