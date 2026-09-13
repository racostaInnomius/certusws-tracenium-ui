// src/pages/Overview.test.jsx
//
// El Overview se monta por bloques según el plan (ADR-0010). Lo que importa
// fijar no es el dibujo sino dos cosas que se rompían en silencio:
//
//   · Un Starter NO pide los datos de los planes superiores. Antes recibía
//     "0 critical findings" en verde de un plugin que no tiene.
//   · La página de un Starter sigue completa: el bloque 1 se sostiene solo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

const catalog = { entitled: null, loading: false };
vi.mock("../hooks/usePluginCatalog", () => ({
  usePluginCatalog: () => catalog,
}));

const auth = { tenantMember: { isActive: true, role: "OWNER" } };
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth }),
}));

vi.mock("../api/overview", () => ({
  fetchOverviewCore: vi.fn(),
  fetchOverviewSecurity: vi.fn(),
  fetchOverviewOperations: vi.fn(),
}));

// Recharts no aporta nada aquí y en jsdom mide 0×0; lo que se prueba es qué
// bloques se montan y qué se pide.
vi.mock("../components/Overview/charts.lazy", () => {
  const stub = (name) => () => <div data-testid={name} />;
  return {
    FleetComposition: stub("fleet-composition"),
    AuditTimeseriesChart: stub("audit-chart"),
    JobsTimeseriesChart: stub("jobs-chart"),
    PatchCoverageCard: stub("patch-recency"),
    ComplianceTrendCard: stub("compliance-trend"),
  };
});

import {
  fetchOverviewCore,
  fetchOverviewOperations,
  fetchOverviewSecurity,
} from "../api/overview";
import { clearCachedFetch } from "../hooks/useCachedFetch";
import Overview from "./Overview";

const ok = (value) => ({ status: "fulfilled", value });

const STARTER = ["amp", "sdp"];
const ENTERPRISE = ["amp", "sdp", "scp", "rcp", "pmp", "cdp"];

beforeEach(() => {
  fetchOverviewCore.mockResolvedValue({
    dashboardSummary: ok({ fleetDevices: 12, totalHosts: 12, inactiveAssets7d: 2 }),
    alertEvents: ok({ items: [] }),
    alertsUnread: ok({ count: 0 }),
    reportRuns: ok({ total: 0, runs: [] }),
    sdpTimeseries: ok({ buckets: [{ bucket: "2026-09-11", succeeded: 3, failed: 1, total: 4 }] }),
    sdpRunning: ok({ items: [{ id: "d1" }] }),
    sdpQueued: ok({ items: [] }),
  });
  fetchOverviewSecurity.mockResolvedValue({
    complianceSummary: ok({ summary: { avgScore: 82, devicesReporting: 10, openFindings: { critical: 1, high: 2 } } }),
    rcpSummary: ok({ summary: { readyNow: 4, fleetTotal: 12, sessionsLast7d: 3 } }),
  });
  fetchOverviewOperations.mockResolvedValue({
    patchSummary: ok({ summary: { devicesReporting: 9, statusBreakdown: { updates_available: 2 }, severityBreakdown: {} } }),
    cdpSummary: ok({ summary: { devicesReporting: 5, totalCerts: 40, expiring30d: 3 } }),
  });
});

afterEach(() => {
  cleanup();
  clearCachedFetch();
  vi.clearAllMocks();
  catalog.entitled = null;
  catalog.loading = false;
  auth.tenantMember.role = "OWNER";
});

const section = (name) => screen.queryByRole("region", { name }) || screen.queryByRole("heading", { name });

function renderWith(entitled, { loading = false } = {}) {
  catalog.entitled = entitled ? new Set(entitled) : null;
  catalog.loading = loading;
  return render(<Overview onNavigate={vi.fn()} />);
}

describe("Overview por plan", () => {
  it("⭐ Starter: sólo el bloque 1, y NO pide nada de SCP, RCP, PMP ni CDP", async () => {
    renderWith(STARTER);

    expect(await screen.findByRole("heading", { name: "Fleet & operations" })).toBeTruthy();
    await waitFor(() => expect(fetchOverviewCore).toHaveBeenCalledWith({ sdp: true }));

    expect(section("Security & access")).toBeNull();
    expect(section("Patching & crypto")).toBeNull();
    expect(fetchOverviewSecurity).not.toHaveBeenCalled();
    expect(fetchOverviewOperations).not.toHaveBeenCalled();
    // La afirmación que mentía en verde ya no existe para este plan.
    expect(screen.queryByText("Critical findings")).toBeNull();
  });

  it("⭐ Starter sigue teniendo una página completa: KPIs, Software Delivery, Reports, alertas", async () => {
    renderWith(STARTER);

    expect(await screen.findByRole("region", { name: "Software delivery" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Reports" })).toBeTruthy();
    expect(screen.getByText("Deployments in progress")).toBeTruthy();
    expect(screen.getByText("Latest alerts")).toBeTruthy();
    expect(screen.getByText("Attention required")).toBeTruthy();
  });

  it("Starter ve UNA línea que dice qué no incluye su plan", async () => {
    renderWith(STARTER);

    const note = await screen.findByRole("note", { name: "Not included in your plan" });
    expect(note.textContent).toMatch(/Security & access .*Professional/);
    expect(note.textContent).toMatch(/Patching & crypto .*Enterprise/);
    expect(within(note).getByRole("button", { name: "View plans" })).toBeTruthy();
  });

  it("sólo el OWNER ve 'View plans'; el resto sabe a quién pedirlo", async () => {
    auth.tenantMember.role = "ADMIN";
    renderWith(STARTER);

    const note = await screen.findByRole("note", { name: "Not included in your plan" });
    expect(within(note).queryByRole("button", { name: "View plans" })).toBeNull();
    expect(note.textContent).toMatch(/tenant owner/);
  });

  it("Enterprise monta los tres bloques con sus cards y no ofrece nada", async () => {
    renderWith(ENTERPRISE);

    expect(await screen.findByRole("heading", { name: "Security & access" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Patching & crypto" })).toBeTruthy();
    await waitFor(() => {
      expect(fetchOverviewSecurity).toHaveBeenCalledWith({ scp: true, rcp: true });
      expect(fetchOverviewOperations).toHaveBeenCalledWith({ pmp: true, cdp: true });
    });
    expect(await screen.findByRole("region", { name: "Patch management" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Crypto discovery" })).toBeTruthy();
    expect(await screen.findByText("Critical findings")).toBeTruthy();
    expect(screen.queryByRole("note", { name: "Not included in your plan" })).toBeNull();
  });

  it("⚠️ mientras el catálogo carga, no se piden los bloques de pago", async () => {
    renderWith(null, { loading: true });

    expect(await screen.findByRole("heading", { name: "Fleet & operations" })).toBeTruthy();
    await waitFor(() => expect(fetchOverviewCore).toHaveBeenCalledWith({ sdp: false }));
    expect(fetchOverviewSecurity).not.toHaveBeenCalled();
    expect(fetchOverviewOperations).not.toHaveBeenCalled();
    // Y tampoco se anuncia nada como "no incluido": aún no se sabe.
    expect(screen.queryByRole("note", { name: "Not included in your plan" })).toBeNull();
  });
});
