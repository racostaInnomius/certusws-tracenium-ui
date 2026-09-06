// src/api/reports.test.js
//
// Contract tests for the ADR-0008 F1a reports client
// (/api/v1/reports/*): types/runs reads, and the authenticated blob
// download path for run().

import { describe, expect, it, vi } from "vitest";

import { API_BASE, respond } from "../test/msw/server";
import { setActiveTenantId } from "./http";
import { getReportTypes, getReportRuns, runReport } from "./reports";

// saveBlob touches real browser APIs — keep everything else in
// browserState real, replace only saveBlob with a spy. Same pattern as
// compliance.test.js.
vi.mock("../utils/browserState", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, saveBlob: vi.fn() };
});
import { saveBlob } from "../utils/browserState";

const BASE = "/api/v1/reports";

describe("getReportTypes", () => {
  it("fetches the entitled catalog", async () => {
    const calls = respond("get", `${BASE}/types`, {
      ok: true,
      types: [{ key: "cdp.cbom", label: "CBOM", description: "", group: "CDP", formats: ["json"] }],
    });

    const res = await getReportTypes();

    expect(calls).toHaveLength(1);
    expect(calls[0].pathname).toBe(`${BASE}/types`);
    expect(calls[0].credentials).toBe("include");
    expect(res.types).toHaveLength(1);
    expect(res.types[0].key).toBe("cdp.cbom");
  });
});

describe("getReportRuns", () => {
  it("fetches without a limit param when none is given", async () => {
    const calls = respond("get", `${BASE}/runs`, { ok: true, runs: [] });
    await getReportRuns();
    expect(calls[0].search).toEqual({});
  });

  it("forwards limit as a query param", async () => {
    const calls = respond("get", `${BASE}/runs`, { ok: true, runs: [] });
    await getReportRuns({ limit: 10 });
    expect(calls[0].search).toEqual({ limit: "10" });
  });
});

// Never a raw <a href>: an anchor navigation can't carry the
// X-Tenant-Id header an MSP operator's drilled-in session needs — same
// incident ADR-0008 documents for the compliance PDF export. runReport
// goes through http.js like every other request, so the header rides
// along the same way it does for JSON reads.
describe("runReport (authenticated blob path)", () => {
  it("requests the relative run endpoint with credentials and saves the blob", async () => {
    const calls = respond("get", `${BASE}/cdp.cbom/run`, { ok: true });

    await runReport("cdp.cbom", "json");

    expect(calls).toHaveLength(1);
    expect(calls[0].pathname).toBe(`${BASE}/cdp.cbom/run`);
    expect(calls[0].search).toEqual({ format: "json" });
    expect(calls[0].credentials).toBe("include");
    expect(saveBlob).toHaveBeenCalledTimes(1);
  });

  it("falls back to a key.format filename when Content-Disposition is absent", async () => {
    respond("get", `${BASE}/audit.events/run`, { ok: true });
    await runReport("audit.events", "csv");
    expect(saveBlob.mock.calls.at(-1)[1]).toBe("audit.events.csv");
  });

  it("carries X-Tenant-Id for an MSP-drilled session — the header a plain <a href> could never send", async () => {
    const calls = respond("get", `${BASE}/cdp.cbom/run`, { ok: true });
    try {
      setActiveTenantId("42");
      await runReport("cdp.cbom", "json");
      expect(calls[0].headers["x-tenant-id"]).toBe("42");
    } finally {
      setActiveTenantId(null);
    }
  });
});

// ── El historial no puede llegar cacheado (plan R0, punto 4) ────────
//
// `getReportRuns` era la única lectura del módulo sin directiva de caché, y
// el efecto se veía: tras "Run now" la página recargaba el historial y recibía
// la entrada de hasta 60 s antes, así que el run recién lanzado no aparecía.
//
// ⚠️ Y `cache: false` NO desactivaba nada: `normalizeGetOptions` hacía
// `options.cache || profile.cache || "default"`, y `false` es falsy. Las seis
// llamadas del módulo que lo pasaban se servían de la caché igual que
// cualquier otra. Por eso el test mira el efecto —dos peticiones de verdad—
// y no la presencia de la opción.
describe("getReportRuns no se sirve de la caché", () => {
  it("dos lecturas seguidas son dos peticiones", async () => {
    const calls = respond("get", `${BASE}/runs`, { ok: true, runs: [] });

    await getReportRuns({ limit: 20 });
    await getReportRuns({ limit: 20 });

    expect(calls).toHaveLength(2);
  });

  it("la segunda lectura ve lo que el servidor devuelve ahora", async () => {
    // Es la forma de usuario del caso anterior: lanzar un reporte y verlo
    // aparecer en el historial sin recargar la página.
    respond("get", `${BASE}/runs`, { ok: true, runs: [] });
    const primera = await getReportRuns({ limit: 20 });
    expect(primera.runs).toHaveLength(0);

    respond("get", `${BASE}/runs`, { ok: true, runs: [{ id: 1, key: "cdp.cbom", format: "json", outcome: "ok" }] });
    const segunda = await getReportRuns({ limit: 20 });

    expect(segunda.runs).toHaveLength(1);
  });
});
