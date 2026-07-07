// src/api/assetGroups.test.js
//
// Contract tests for /api/v1/asset-groups.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  addAssetGroupMembers,
  createAssetGroup,
  deleteAssetGroup,
  dispatchAssetGroupJob,
  getAssetGroup,
  getAssetGroupCoverage,
  getCriteriaCatalog,
  getCriteriaSuggestions,
  listAssetGroupMembers,
  listAssetGroups,
  listUngroupedDevices,
  previewAssetGroupCriteria,
  removeAssetGroupMember,
  updateAssetGroup,
} from "./assetGroups";

const BASE = "/api/v1/asset-groups";

describe("group CRUD", () => {
  it("listAssetGroups forwards filters as query params", async () => {
    const calls = respond("get", BASE, { ok: true, items: [] });

    await listAssetGroups({ type: "dynamic", search: "lab", page: 1 });

    expect(calls[0].search).toEqual({ type: "dynamic", search: "lab", page: "1" });
  });

  it("getAssetGroup encodes the id", async () => {
    const calls = respond("get", `${BASE}/:id`, { ok: true, group: {} });

    await getAssetGroup("g 1");

    expect(calls[0].pathname).toBe(`${BASE}/g%201`);
  });

  it("createAssetGroup POSTs the payload; updateAssetGroup PATCHes it", async () => {
    const create = respond("post", BASE, { ok: true, id: "g9" });
    const update = respond("patch", `${BASE}/:id`, { ok: true });

    await createAssetGroup({ name: "Lab", type: "static" });
    await updateAssetGroup("g9", { name: "Lab 2" });

    expect(create[0].body).toEqual({ name: "Lab", type: "static" });
    expect(update[0].method).toBe("PATCH");
    expect(update[0].body).toEqual({ name: "Lab 2" });
  });

  it("deleteAssetGroup issues DELETE", async () => {
    const calls = respond("delete", `${BASE}/:id`, { ok: true });

    await deleteAssetGroup("g9");

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].pathname).toBe(`${BASE}/g9`);
  });
});

describe("membership", () => {
  it("listAssetGroupMembers nests under the group with filters", async () => {
    const calls = respond("get", `${BASE}/:id/members`, { ok: true, items: [] });

    await listAssetGroupMembers("g1", { page: 2 });

    expect(calls[0].pathname).toBe(`${BASE}/g1/members`);
    expect(calls[0].search).toEqual({ page: "2" });
  });

  it("addAssetGroupMembers wraps device ids in { deviceIds } (defaults to [])", async () => {
    const calls = respond("post", `${BASE}/:id/members`, { ok: true });

    await addAssetGroupMembers("g1", ["d1", "d2"]);
    await addAssetGroupMembers("g1");

    expect(calls[0].body).toEqual({ deviceIds: ["d1", "d2"] });
    expect(calls[1].body).toEqual({ deviceIds: [] });
  });

  it("removeAssetGroupMember encodes both ids in the path", async () => {
    const calls = respond("delete", `${BASE}/:id/members/:deviceId`, { ok: true });

    await removeAssetGroupMember("g 1", "dev/2");

    expect(calls[0].pathname).toBe(`${BASE}/g%201/members/dev%2F2`);
  });
});

describe("criteria & coverage", () => {
  it("catalog / suggestions / coverage / ungrouped hit their read paths", async () => {
    const catalog = respond("get", `${BASE}/criteria-catalog`, { ok: true, items: [] });
    const suggestions = respond("get", `${BASE}/criteria-suggestions`, { ok: true, items: [] });
    const coverage = respond("get", `${BASE}/coverage`, { ok: true });
    const ungrouped = respond("get", `${BASE}/ungrouped-devices`, { ok: true, items: [] });

    await getCriteriaCatalog();
    await getCriteriaSuggestions({ field: "platform" });
    await getAssetGroupCoverage();
    await listUngroupedDevices({ page: 1 });

    expect(catalog[0].pathname).toBe(`${BASE}/criteria-catalog`);
    expect(suggestions[0].search).toEqual({ field: "platform" });
    expect(coverage[0].pathname).toBe(`${BASE}/coverage`);
    expect(ungrouped[0].search).toEqual({ page: "1" });
  });

  it("previewAssetGroupCriteria only includes sampleSize when provided", async () => {
    const calls = respond("post", `${BASE}/preview`, { ok: true, matches: 3 });
    const criteriaJson = { all: [{ field: "platform", op: "eq", value: "windows" }] };

    await previewAssetGroupCriteria(criteriaJson);
    await previewAssetGroupCriteria(criteriaJson, 10);

    expect(calls[0].body).toEqual({ criteriaJson });
    expect(calls[1].body).toEqual({ criteriaJson, sampleSize: 10 });
  });

  it("dispatchAssetGroupJob POSTs the job payload under the group", async () => {
    const calls = respond("post", `${BASE}/:id/jobs`, { ok: true, created: 5 });

    await dispatchAssetGroupJob("g1", { type: "patch_scan" });

    expect(calls[0].pathname).toBe(`${BASE}/g1/jobs`);
    expect(calls[0].body).toEqual({ type: "patch_scan" });
  });
});
