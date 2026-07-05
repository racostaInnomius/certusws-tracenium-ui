// src/api/softwareDelivery.test.js
//
// Contract tests for the SDP client (/api/v1/software-delivery):
// catalog CRUD + deployment fan-out.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import {
  cancelDeployment,
  createPackage,
  deletePackage,
  deployPackage,
  getDeployment,
  getPackage,
  listDeploymentResults,
  listDeployments,
  listPackages,
  updatePackage,
  uploadIntake,
  listIntakes,
  getIntake,
  approveIntake,
  rejectIntake,
} from "./softwareDelivery";

const BASE = "/api/v1/software-delivery";

describe("catalog (software_packages)", () => {
  it("listPackages serializes filters as query params and skips empty ones", async () => {
    const calls = respond("get", BASE, { ok: true, items: [] });

    await listPackages({
      platform: "windows",
      enabled: true,
      page: 2,
      search: "",        // empty string → dropped
      vendor: null,      // null → dropped
      arch: undefined,   // undefined → dropped
    });

    expect(calls[0].search).toEqual({
      platform: "windows",
      enabled: "true",
      page: "2",
    });
  });

  it("listPackages without filters sends no query string", async () => {
    const calls = respond("get", BASE, { ok: true, items: [] });

    await listPackages();

    expect(calls[0].searchString).toBe("");
  });

  it("listPackages returns the raw backend envelope (caller checks ok)", async () => {
    const envelope = { ok: true, total: 1, items: [{ id: "p1", name: "7zip" }] };
    respond("get", BASE, envelope);

    await expect(listPackages()).resolves.toEqual(envelope);
  });

  it("getPackage URL-encodes the id in the path", async () => {
    const calls = respond("get", `${BASE}/:id`, { ok: true });

    await getPackage("pkg/with slash");

    expect(calls[0].pathname).toBe(`${BASE}/pkg%2Fwith%20slash`);
  });

  it("createPackage POSTs the payload as-is", async () => {
    const calls = respond("post", BASE, { ok: true, id: "p9" });
    const payload = { name: "chrome", platform: "windows", installArgs: "/S" };

    await createPackage(payload);

    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual(payload);
  });

  it("updatePackage uses PATCH with the partial payload", async () => {
    const calls = respond("patch", `${BASE}/:id`, { ok: true });

    await updatePackage("p1", { enabled: false });

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].pathname).toBe(`${BASE}/p1`);
    expect(calls[0].body).toEqual({ enabled: false });
  });

  it("deletePackage issues DELETE on the package path", async () => {
    const calls = respond("delete", `${BASE}/:id`, { ok: true });

    await deletePackage("p1");

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].pathname).toBe(`${BASE}/p1`);
  });
});

describe("deployments", () => {
  it("deployPackage POSTs the target body to /:packageId/deploy", async () => {
    const calls = respond("post", `${BASE}/:id/deploy`, { ok: true, deploymentId: "d1" }, { status: 202 });

    const res = await deployPackage("pkg-1", {
      target: { assetGroupId: "g1" },
      expectedExitCodes: [0, 3010],
    });

    expect(calls[0].pathname).toBe(`${BASE}/pkg-1/deploy`);
    expect(calls[0].body).toEqual({
      target: { assetGroupId: "g1" },
      expectedExitCodes: [0, 3010],
    });
    expect(res).toEqual({ ok: true, deploymentId: "d1" });
  });

  it("listDeployments passes filters as query params", async () => {
    const calls = respond("get", `${BASE}/deployments`, { ok: true, items: [] });

    await listDeployments({ status: "running", limit: 20 });

    expect(calls[0].search).toEqual({ status: "running", limit: "20" });
  });

  it("getDeployment / listDeploymentResults hit the deployment sub-paths", async () => {
    const detail = respond("get", `${BASE}/deployments/:id`, { ok: true, deployment: {} });
    const results = respond("get", `${BASE}/deployments/:id/results`, { ok: true, items: [] });

    await getDeployment("d1");
    await listDeploymentResults("d1");

    expect(detail[0].pathname).toBe(`${BASE}/deployments/d1`);
    expect(results[0].pathname).toBe(`${BASE}/deployments/d1/results`);
  });

  it("cancelDeployment POSTs an empty JSON body", async () => {
    const calls = respond("post", `${BASE}/deployments/:id/cancel`, { ok: true });

    await cancelDeployment("d1");

    expect(calls[0].pathname).toBe(`${BASE}/deployments/d1/cancel`);
    expect(calls[0].body).toEqual({});
  });

  it("propagates backend error envelopes as thrown errors with the backend code", async () => {
    respond(
      "post",
      `${BASE}/:id/deploy`,
      { error: "NO_DEVICES_IN_TARGET", message: "target resolves to 0 devices" },
      { status: 422 }
    );

    const err = await deployPackage("pkg-1", { target: {} }).catch((e) => e);

    expect(err.status).toBe(422);
    expect(err.code).toBe("NO_DEVICES_IN_TARGET");
    expect(err.body.message).toBe("target resolves to 0 devices");
  });
});

describe("AI intake", () => {
  it("uploadIntake posts the bytes as octet-stream with metadata in the query", async () => {
    const calls = respond("post", `${BASE}/intake`, { ok: true, intake: { id: 1 } }, { status: 201 });

    const file = new File([new Uint8Array([0x4d, 0x5a, 1, 2, 3])], "app.exe");
    await uploadIntake(file, { name: "App", version: "1.0", declaredSha256: "abc" });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].search).toEqual({
      filename: "app.exe",
      name: "App",
      version: "1.0",
      declaredSha256: "abc",
    });
    expect(calls[0].headers["content-type"]).toBe("application/octet-stream");
  });

  it("uploadIntake falls back to the File name when no filename hint is given", async () => {
    const calls = respond("post", `${BASE}/intake`, { ok: true }, { status: 201 });
    await uploadIntake(new File(["x"], "setup.msi"));
    expect(calls[0].search.filename).toBe("setup.msi");
  });

  it("listIntakes serializes a status filter", async () => {
    const calls = respond("get", `${BASE}/intake`, { ok: true, items: [] });
    await listIntakes({ status: "pending_review", limit: 20 });
    expect(calls[0].search).toEqual({ status: "pending_review", limit: "20" });
  });

  it("getIntake URL-encodes the id", async () => {
    const calls = respond("get", `${BASE}/intake/:id`, { ok: true });
    await getIntake("7");
    expect(calls[0].pathname).toBe(`${BASE}/intake/7`);
  });

  it("approveIntake posts the operator overrides as JSON", async () => {
    const calls = respond("post", `${BASE}/intake/:id/approve`, { ok: true }, { status: 201 });
    await approveIntake("5", { arch: "x64", downloadPath: "https://cdn/app.exe" });
    expect(calls[0].pathname).toBe(`${BASE}/intake/5/approve`);
    expect(calls[0].body).toEqual({ arch: "x64", downloadPath: "https://cdn/app.exe" });
  });

  it("rejectIntake posts an empty body", async () => {
    const calls = respond("post", `${BASE}/intake/:id/reject`, { ok: true });
    await rejectIntake("5");
    expect(calls[0].pathname).toBe(`${BASE}/intake/5/reject`);
    expect(calls[0].body).toEqual({});
  });
});
