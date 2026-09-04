// src/pages/Reports.test.jsx
//
// ADR-0008 Fase F1a — the catalog is entirely server-driven, so this
// test's main job is proving the page renders exactly what /types
// returns (no client-side gating to duplicate) and that clicking a
// format button goes through the authenticated blob path, not a raw
// link.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server, respond, API_BASE } from "../test/msw/server";

vi.mock("../utils/browserState", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, saveBlob: vi.fn() };
});
import { saveBlob } from "../utils/browserState";

// EmailReportDialog (rendered inside Reports, just not visibly "open"
// until a row's Email button is clicked) calls useAuthContext()
// unconditionally — same mock TenantsAdministrator.test.jsx uses.
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 7 },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

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
    {
      key: "scp.evidence-pack",
      label: "Evidence Pack",
      description: "Audit-ready evidence for one framework over a period.",
      group: "SCP",
      formats: ["pdf", "json"],
      params: [
        { name: "framework", label: "Framework", kind: "framework", required: true },
        { name: "from", label: "From month", kind: "month", required: true },
        { name: "to", label: "To month", kind: "month", required: true },
      ],
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

    const row = (await screen.findByText("Crypto Bill of Materials (CBOM)")).closest("[role='row']");
    const jsonButton = within(row).getByRole("button", { name: /json/i });
    await userEvent.click(jsonButton);

    await waitFor(() => expect(runCalls).toHaveLength(1));
    expect(runCalls[0].search).toEqual({ format: "json" });
    expect(runCalls[0].credentials).toBe("include");
    expect(saveBlob).toHaveBeenCalledTimes(1);
    // No <a href> anywhere on the page for a report download.
    expect(document.querySelector("a[href*='/reports/']")).toBeNull();
  });

  it("clicking Email opens the dialog for that row's report type", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", "/api/v1/tenants/7/members", { items: [] });

    render(<Reports />);

    const emailButtons = await screen.findAllByRole("button", { name: /email/i });
    await userEvent.click(emailButtons[0]);

    expect(await screen.findByText(/Email "Crypto Bill of Materials \(CBOM\)"/i)).toBeInTheDocument();
  });

  it("shows an error snackbar when the catalog fails to load", async () => {
    respond("get", `${BASE}/types`, { error: "TENANT_NOT_RESOLVED" }, { status: 403 });
    respond("get", `${BASE}/runs`, { error: "TENANT_NOT_RESOLVED" }, { status: 403 });

    render(<Reports />);

    expect(await screen.findByText(/could not load reports|tenant_not_resolved/i)).toBeInTheDocument();
  });
});

describe("Reports page (types with params)", () => {
  it("a type that declares params asks for them and sends them as query on run", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", "/api/v1/security/compliance/frameworks", { ok: true, frameworks: [{ framework: "soc2_tsc_2017", shortName: "SOC 2 (TSC 2017)" }] });
    const runCalls = respond("get", `${BASE}/scp.evidence-pack/run`, { ok: true });
    render(<Reports />);

    const row = (await screen.findByText("Evidence Pack")).closest("[role='row']");
    await userEvent.click(within(row).getByRole("button", { name: "PDF" }));

    // Diálogo de parámetros, no descarga inmediata.
    expect(runCalls).toHaveLength(0);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByLabelText("Framework")).toHaveTextContent("SOC 2 (TSC 2017)"));
    const from = within(dialog).getByLabelText("From month");
    const to = within(dialog).getByLabelText("To month");
    await userEvent.clear(from); await userEvent.type(from, "2026-06");
    await userEvent.clear(to); await userEvent.type(to, "2026-08");
    await userEvent.click(within(dialog).getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(runCalls).toHaveLength(1));
    expect(runCalls[0].search).toEqual({ format: "pdf", framework: "soc2_tsc_2017", from: "2026-06", to: "2026-08" });
    expect(saveBlob).toHaveBeenCalled();
  });
});

// ── ADR-0014 E3: schedules panel + archived runs ──────────────────────

const SCHEDULES = {
  ok: true,
  schedules: [
    {
      id: 5,
      reportKey: "scp.evidence-pack",
      format: "pdf",
      params: { framework: "soc2_tsc_2017" },
      periodMonths: 1,
      recipientMemberIds: [11],
      recipientExternal: ["auditor@example.com"],
      enabled: true,
      nextRunAt: "2026-10-01T06:00:00.000Z",
      lastRunAt: null,
      lastRunStatus: null,
    },
  ],
};

describe("Reports — schedules (E3)", () => {
  it("renders the schedules panel from the server and offers Schedule on every catalog row", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, SCHEDULES);
    render(<Reports />);
    await screen.findAllByText("Evidence Pack");
    expect(await screen.findByText("Previous month", { exact: false })).toBeTruthy();
    expect(screen.queryByTestId("schedules-empty")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^schedule$/i })).toHaveLength(TYPES.types.length);
  });

  it("a backend without schedules still renders the catalog", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { error: "NOT_FOUND" }, { status: 404 });
    render(<Reports />);
    await screen.findByText("Evidence Pack");
    expect(await screen.findByTestId("schedules-empty")).toBeTruthy();
  });

  it("an archived run gets a download button that goes through the blob path", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, {
      ok: true,
      runs: [{ id: 9, occurredAt: "2026-09-01T06:00:00.000Z", key: "scp.evidence-pack", format: "pdf", trigger: "schedule", outcome: "sent", actor: "schedule:5", sha256: "abc", filename: "pack.pdf", downloadable: true }],
    });
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    server.use(
      http.get(`${API_BASE}${BASE}/runs/9/download`, () =>
        new HttpResponse("%PDF", { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="pack.pdf"' } })
      )
    );
    saveBlob.mockClear();
    render(<Reports />);
    const btn = await screen.findByRole("button", { name: /download archived copy/i });
    await userEvent.setup().click(btn);
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(saveBlob.mock.calls[0][1]).toBe("pack.pdf");
  });
});
