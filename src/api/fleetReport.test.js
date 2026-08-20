// src/api/fleetReport.test.js
//
// Contract tests for the Fleet Health Report client
// (/api/v1/fleet-report): preview fetch + CSV/PDF export downloads.
// Mirrors src/api/compliance.test.js's export-download pattern.

import { describe, expect, it, vi } from "vitest";

import { respond } from "../test/msw/server";
import { fetchFleetReport, downloadFleetReport } from "./fleetReport";

const BASE = "/api/v1/fleet-report";

// saveBlob touches real browser APIs — replace only that export, keep
// everything else in browserState real (same trade-off as compliance.test.js).
vi.mock("../utils/browserState", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, saveBlob: vi.fn() };
});
import { saveBlob } from "../utils/browserState";

describe("fetchFleetReport", () => {
  it("requests the preview endpoint with the period as query params", async () => {
    const envelope = { ok: true, report: { tenant: { id: 1, name: "Banco X" } } };
    const calls = respond("get", `${BASE}/`, envelope);

    const resp = await fetchFleetReport({ from: "2026-06-01", to: "2026-06-30" });

    expect(resp).toEqual(envelope);
    expect(calls).toHaveLength(1);
    expect(calls[0].search).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("omits the query string entirely when no period is given", async () => {
    const calls = respond("get", `${BASE}/`, { ok: true, report: null });
    await fetchFleetReport();
    expect(calls[0].search).toEqual({});
  });
});

describe("downloadFleetReport (authenticated blob path)", () => {
  it("requests export.csv with credentials and saves the blob", async () => {
    const calls = respond("get", `${BASE}/export.csv`, { ok: true });

    await downloadFleetReport("csv", { from: "2026-06-01", to: "2026-06-30" });

    expect(calls).toHaveLength(1);
    expect(calls[0].pathname).toBe(`${BASE}/export.csv`);
    expect(calls[0].search).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(calls[0].credentials).toBe("include");
    expect(saveBlob).toHaveBeenCalledTimes(1);
  });

  it("requests export.pdf for fmt='pdf' and falls back to a default filename", async () => {
    const calls = respond("get", `${BASE}/export.pdf`, { ok: true });

    await downloadFleetReport("pdf");

    expect(calls).toHaveLength(1);
    expect(calls[0].pathname).toBe(`${BASE}/export.pdf`);
    expect(saveBlob.mock.calls.at(-1)[1]).toBe("tracenium-fleet-health.pdf");
  });

  it("treats any non-'pdf' fmt as csv", async () => {
    const calls = respond("get", `${BASE}/export.csv`, { ok: true });
    await downloadFleetReport("whatever");
    expect(calls[0].pathname).toBe(`${BASE}/export.csv`);
  });
});
