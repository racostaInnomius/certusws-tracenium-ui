// src/pages/Reports.test.jsx
//
// ADR-0008 Fase F1a — the catalog is entirely server-driven, so this
// test's main job is proving the page renders exactly what /types
// returns (no client-side gating to duplicate) and that clicking a
// format button goes through the authenticated blob path, not a raw
// link.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, respond } from "../test/msw/server";

vi.mock("../utils/browserState", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, saveBlob: vi.fn() };
});
import { saveBlob } from "../utils/browserState";

import Reports from "./Reports";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

const BASE = "/api/v1/reports";

const TYPES = {
  ok: true,
  types: [
    {
      key: "cdp.cbom",
      label: "Crypto Bill of Materials (CBOM)",
      description: "CycloneDX 1.6 crypto asset inventory.",
      group: "CDP",
      formats: ["json"],
    },
    {
      key: "audit.events",
      label: "Audit Events",
      description: "Security/audit event trail export.",
      group: "Audit",
      formats: ["csv"],
    },
  ],
};

const RUNS = {
  ok: true,
  runs: [
    {
      occurredAt: "2026-08-22T00:00:00.000Z",
      key: "cdp.cbom",
      format: "json",
      outcome: "ok",
      actor: "op@tracenium.test",
    },
  ],
};

describe("Reports page", () => {
  it("renders only the report types the server returns", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);

    render(<Reports />);

    expect(await screen.findByText("Crypto Bill of Materials (CBOM)")).toBeInTheDocument();
    expect(screen.getByText("Audit Events")).toBeInTheDocument();
    // A type NOT present in the server response must never appear —
    // proves there's no client-side catalog to drift from the backend.
    expect(screen.queryByText("Fleet Health Report")).not.toBeInTheDocument();
  });

  it("renders the recent-runs history from the server", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);

    render(<Reports />);

    expect(await screen.findByText("op@tracenium.test")).toBeInTheDocument();
  });

  it("running a report goes through the authenticated blob path, not a link", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    const runCalls = respond("get", `${BASE}/cdp.cbom/run`, { ok: true });

    render(<Reports />);

    const jsonButton = await screen.findByRole("button", { name: /json/i });
    await userEvent.click(jsonButton);

    await waitFor(() => expect(runCalls).toHaveLength(1));
    expect(runCalls[0].search).toEqual({ format: "json" });
    expect(runCalls[0].credentials).toBe("include");
    expect(saveBlob).toHaveBeenCalledTimes(1);
    // No <a href> anywhere on the page for a report download.
    expect(document.querySelector("a[href*='/reports/']")).toBeNull();
  });

  it("shows an error snackbar when the catalog fails to load", async () => {
    respond("get", `${BASE}/types`, { error: "TENANT_NOT_RESOLVED" }, { status: 403 });
    respond("get", `${BASE}/runs`, { error: "TENANT_NOT_RESOLVED" }, { status: 403 });

    render(<Reports />);

    expect(await screen.findByText(/could not load reports|tenant_not_resolved/i)).toBeInTheDocument();
  });
});
