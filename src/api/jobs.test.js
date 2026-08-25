// src/api/jobs.test.js
//
// Contract tests for the orchestrator client (/api/v1/orchestrator).

import { describe, expect, it } from "vitest";

import { API_BASE, http, HttpResponse, respond, server } from "../test/msw/server";
import { clearApiCache } from "./http";
import {
  cancelJob,
  createDeviceJob,
  createTenantJobs,
  getJob,
  listAllKnownDevices,
  listDeviceJobs,
  listJobTypes,
  listKnownDevices,
  listTenantJobs,
  retryJob
} from "./jobs";

const BASE = "/api/v1/orchestrator";

describe("listKnownDevices", () => {
  it("maps pagination/search params and stringifies them", async () => {
    const calls = respond("get", `${BASE}/known-devices`, { ok: true, items: [] });

    await listKnownDevices({ page: 2, pageSize: 25, search: "lab" });

    expect(calls[0].search).toEqual({ page: "2", pageSize: "25", search: "lab" });
  });

  it("only sends includeGroups when strictly true", async () => {
    const calls = respond("get", `${BASE}/known-devices`, { ok: true, items: [] });

    await listKnownDevices({ includeGroups: true });
    await listKnownDevices({ includeGroups: false });
    // Same URL as the previous call → clear the GET cache so the
    // request actually reaches the network again.
    clearApiCache();
    await listKnownDevices({ includeGroups: "yes" }); // truthy but not === true

    expect(calls[0].search).toEqual({ includeGroups: "true" });
    expect(calls[1].searchString).toBe("");
    expect(calls[2].searchString).toBe("");
  });

  it("ignores unknown params (only the whitelisted ones are forwarded)", async () => {
    const calls = respond("get", `${BASE}/known-devices`, { ok: true, items: [] });

    await listKnownDevices({ page: 1, evil: "1; DROP TABLE" });

    expect(calls[0].search).toEqual({ page: "1" });
  });
});

describe("job reads", () => {
  it("listJobTypes hits /job-types", async () => {
    const calls = respond("get", `${BASE}/job-types`, { ok: true, items: [] });

    await listJobTypes();

    expect(calls[0].pathname).toBe(`${BASE}/job-types`);
  });

  it("listDeviceJobs encodes the deviceId and forwards filters", async () => {
    const calls = respond("get", `${BASE}/devices/:deviceId/jobs`, { ok: true, items: [] });

    await listDeviceJobs("dev 01", { status: "failed", limit: 10 });

    expect(calls[0].pathname).toBe(`${BASE}/devices/dev%2001/jobs`);
    expect(calls[0].search).toEqual({ status: "failed", limit: "10" });
  });

  it("getJob encodes the jobId", async () => {
    const calls = respond("get", `${BASE}/jobs/:jobId`, { ok: true, job: {} });

    await getJob("job#1");

    expect(calls[0].pathname).toBe(`${BASE}/jobs/job%231`);
  });

  it("listTenantJobs nests under the tenant path", async () => {
    const calls = respond("get", `${BASE}/tenants/:tenantId/jobs`, { ok: true, items: [] });

    await listTenantJobs("t-1", { page: 1 });

    expect(calls[0].pathname).toBe(`${BASE}/tenants/t-1/jobs`);
    expect(calls[0].search).toEqual({ page: "1" });
  });
});

describe("job mutations", () => {
  it("retryJob / cancelJob POST an empty JSON body to the action sub-path", async () => {
    const retry = respond("post", `${BASE}/jobs/:jobId/retry`, { ok: true });
    const cancel = respond("post", `${BASE}/jobs/:jobId/cancel`, { ok: true });

    await retryJob("j-1");
    await cancelJob("j-2");

    expect(retry[0].pathname).toBe(`${BASE}/jobs/j-1/retry`);
    expect(retry[0].body).toEqual({});
    expect(cancel[0].pathname).toBe(`${BASE}/jobs/j-2/cancel`);
    expect(cancel[0].body).toEqual({});
  });

  it("createDeviceJob POSTs the payload to the device jobs collection", async () => {
    const calls = respond("post", `${BASE}/devices/:deviceId/jobs`, { ok: true, jobId: "j-9" });
    const payload = { type: "collect_facts", args: { full: true } };

    await createDeviceJob("dev-1", payload);

    expect(calls[0].pathname).toBe(`${BASE}/devices/dev-1/jobs`);
    expect(calls[0].body).toEqual(payload);
  });

  it("createTenantJobs POSTs the fan-out payload to the tenant jobs collection", async () => {
    const calls = respond("post", `${BASE}/tenants/:tenantId/jobs`, { ok: true, created: 4 });
    const payload = { type: "patch_scan", deviceIds: ["a", "b"] };

    await createTenantJobs("t-1", payload);

    expect(calls[0].pathname).toBe(`${BASE}/tenants/t-1/jobs`);
    expect(calls[0].body).toEqual(payload);
  });
});

describe("listAllKnownDevices — la lista completa, no la primera página", () => {
  it("sigue la paginación hasta agotar el total", async () => {
    // El bug real: el backend pagina de 25 en 25 y la página pedía sin
    // parámetros, así que se quedaba con los 25 primeros de un tenant de 45.
    // Eso rompía en silencio tres cosas: el hostname de las filas, el selector
    // de destino y —la peor— `connectedDeviceIds`, que ES la carga del
    // despacho "a todos los conectados del tenant".
    const paginas = {
      1: { ok: true, items: Array.from({ length: 100 }, (_v, i) => ({ deviceId: `d${i}` })), total: 145 },
      2: { ok: true, items: Array.from({ length: 45 }, (_v, i) => ({ deviceId: `d${100 + i}` })), total: 145 },
    };
    server.use(
      http.get(`${API_BASE}/api/v1/orchestrator/known-devices`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page") || 1);
        return HttpResponse.json(paginas[page]);
      })
    );

    const res = await listAllKnownDevices();

    expect(res.items).toHaveLength(145);
    expect(res.total).toBe(145);
  });

  it("para en una página corta sin pedir una de más", async () => {
    const calls = respond("get", "/api/v1/orchestrator/known-devices", {
      ok: true,
      items: [{ deviceId: "a" }, { deviceId: "b" }],
      total: 2,
    });

    const res = await listAllKnownDevices();

    expect(res.items).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });
});
