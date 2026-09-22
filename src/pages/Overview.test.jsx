// src/pages/Overview.test.jsx
//
// El Overview se monta por bloques según el plan (ADR-0010). Lo que importa
// fijar no es el dibujo sino dos cosas que se rompían en silencio:
//
//   · Un Starter NO pide los datos de los planes superiores. Antes recibía
//     "0 critical findings" en verde de un plugin que no tiene.
//   · La página de un Starter sigue completa: el bloque 1 se sostiene solo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const catalog = { entitled: null, loading: false };
vi.mock("../hooks/usePluginCatalog", () => ({
  usePluginCatalog: () => catalog,
}));

const auth = { tenantMember: { isActive: true, role: "OWNER" } };
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth }),
}));

vi.mock("../api/dashboard", () => ({
  dashboardApi: { getSignalCoverage: vi.fn(), getSignalGapDevices: vi.fn() },
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
import { dashboardApi } from "../api/dashboard";
import { clearCachedFetch } from "../hooks/useCachedFetch";
import Overview from "./Overview";

const ok = (value) => ({ status: "fulfilled", value });

const STARTER = ["amp", "sdp"];
const ENTERPRISE = ["amp", "sdp", "scp", "rcp", "pmp", "cdp"];

const COVERAGE = {
  fleet: 68,
  devicesWithAnyGap: 20,
  signals: [
    { key: "inventory", label: "Hardware & OS inventory", plugin: "amp", entitled: true, staleAfterDays: 3, reporting: 64, stale: 3, never: 1, blind: 4, blindPct: 5.9 },
    { key: "compliance", label: "Compliance posture", plugin: "scp", entitled: true, staleAfterDays: 3, reporting: 59, stale: 9, never: 0, blind: 9, blindPct: 13.2 },
    { key: "patches", label: "Missing patches", plugin: "pmp", entitled: true, staleAfterDays: 14, reporting: 52, stale: 0, never: 16, blind: 16, blindPct: 23.5 },
    { key: "certificates", label: "Certificates", plugin: "cdp", entitled: true, staleAfterDays: 14, reporting: 68, stale: 0, never: 0, blind: 0, blindPct: 0 },
  ],
};

beforeEach(() => {
  dashboardApi.getSignalCoverage.mockResolvedValue(COVERAGE);
  fetchOverviewCore.mockResolvedValue({
    dashboardSummary: ok({ fleetDevices: 12, totalHosts: 12, inactiveAssets7d: 2 }),
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

    expect(await screen.findByRole("button", { name: "Software delivery" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Reports" })).toBeTruthy();
    expect(screen.getByText("Deployments in progress")).toBeTruthy();
    // "Latest alerts" se fue: la campana de la barra superior ya lo dice.
    expect(screen.queryByText("Latest alerts")).toBeNull();
    expect(screen.getByText("Attention required")).toBeTruthy();
  });

  it("Starter ve UNA línea que dice qué no incluye su plan", async () => {
    renderWith(STARTER);

    const note = await screen.findByRole("note", { name: "Not included in your plan" });
    expect(note.textContent).toMatch(/Security & access .*Professional/);
    expect(note.textContent).toMatch(/Patching & crypto .*Business/);
    expect(within(note).getByRole("button", { name: "View plans" })).toBeTruthy();
  });

  it("sólo el OWNER ve 'View plans'; el resto sabe a quién pedirlo", async () => {
    auth.tenantMember.role = "ADMIN";
    renderWith(STARTER);

    const note = await screen.findByRole("note", { name: "Not included in your plan" });
    expect(within(note).queryByRole("button", { name: "View plans" })).toBeNull();
    expect(note.textContent).toMatch(/tenant owner/);
  });

  it("Business monta los tres bloques con sus cards y no ofrece nada", async () => {
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

  it("⭐ un enlace del Overview no arrastra filtros de la página visitada antes", async () => {
    // La barra lateral sólo cambia `page`: volver al Overview desde Jobs dejaba
    // `status=failed` en la URL, y el siguiente clic se lo pasaba a Alerts o a
    // Security Compliance, que tienen su propio `status`.
    window.history.replaceState({}, "", "/?page=overview&status=failed&score-band=critical&since=30d");
    renderWith(STARTER);

    fireEvent.click(await screen.findByText("Unread alerts"));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("page")).toBe("alerts");
    for (const stale of ["status", "score-band", "since"]) expect(params.has(stale)).toBe(false);
  });
});

describe("Overview — quién reporta cada señal (antes «Blind spots» en Asset Management)", () => {
  const blockOf = (name) => screen.getByRole("heading", { name }).closest("section");

  it("⭐ titular en la cabecera; cada señal integrada en la fila de SU bloque", async () => {
    renderWith(ENTERPRISE);
    expect(await screen.findByTestId("coverage-headline")).toHaveTextContent("20 of 68 devices are missing at least one signal");
    await screen.findByRole("heading", { name: "Patching & crypto" });

    // Fleet & operations: una card "Blind spots" en la fila de cards, con el inventario.
    const fleet = blockOf("Fleet & operations");
    const card = await within(fleet).findByRole("region", { name: "Blind spots" });
    expect(within(card).getByText("Hardware & OS inventory")).toBeTruthy();
    expect(within(card).getByText("64/68")).toBeTruthy();
    expect(within(fleet).queryByText("Compliance posture")).toBeNull();

    // Security & access: quinto KPI.
    const security = blockOf("Security & access");
    const kpi = within(security).getByRole("button", { name: /Compliance reporting/ });
    expect(kpi).toHaveTextContent("59/68");
    expect(kpi).toHaveTextContent("9 silent for over 3 days");

    // Patching & crypto: una pieza por card de abajo.
    const patching = blockOf("Patching & crypto");
    expect(within(patching).getAllByTestId("signal-coverage-tile")).toHaveLength(2);
    expect(within(patching).getByText("Missing patches")).toBeTruthy();
    expect(within(patching).getByText("Certificates")).toBeTruthy();
  });

  it("⚠️ Starter: sólo la card de inventario; ni KPI de compliance ni piezas de parches/certificados", async () => {
    renderWith(STARTER);
    expect(await screen.findByRole("region", { name: "Blind spots" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Compliance reporting/ })).toBeNull();
    expect(screen.queryByTestId("signal-coverage-tile")).toBeNull();
    expect(screen.queryByText("Missing patches")).toBeNull();
  });

  it("sin permiso assets_view (403) la página sigue entera, sin ninguna pieza de cobertura", async () => {
    dashboardApi.getSignalCoverage.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
    renderWith(ENTERPRISE);
    expect(await screen.findByRole("heading", { name: "Security & access" })).toBeTruthy();
    await waitFor(() => expect(dashboardApi.getSignalCoverage).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Blind spots" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Compliance reporting/ })).toBeNull();
    expect(screen.queryByTestId("signal-coverage-tile")).toBeNull();
    expect(screen.queryByTestId("coverage-headline")).toBeNull();
    // La fila de cards sigue con las suyas.
    expect(screen.getByRole("region", { name: "Reports" })).toBeTruthy();
  });
});

describe("Overview — QUIÉNES son los equipos del hueco", () => {
  it("⭐ «16 never reported» abre la lista de esos equipos, y cada uno lleva a su ficha", async () => {
    dashboardApi.getSignalGapDevices.mockResolvedValue({
      signal: "patches", label: "Missing patches", staleAfterDays: 14, entitled: true, truncated: false,
      devices: [
        { agentId: "a-1", hostname: "FINANZAS-07", reason: "never", lastReportAt: null },
        { agentId: "a-2", hostname: "RECEPCION", reason: "stale", lastReportAt: "2026-08-01T00:00:00Z" },
      ],
    });
    const navigated = [];
    const onPop = () => navigated.push(window.location.search);
    window.addEventListener("popstate", onPop);
    try {
      renderWith(ENTERPRISE);
      const link = await screen.findByRole("button", { name: /16 never reported — see which devices/i });
      fireEvent.click(link);
      expect(dashboardApi.getSignalGapDevices).toHaveBeenCalledWith("patches");
      const drawer = await screen.findByRole("region", { name: /Missing patches — devices not reporting/i });
      expect(within(drawer).getByText("FINANZAS-07")).toBeTruthy();
      expect(within(drawer).getByText("Never reported")).toBeTruthy();
      fireEvent.click(within(drawer).getByText("RECEPCION"));
      await waitFor(() => expect(navigated.some((q) => /page=assets/.test(q) && /device=a-2/.test(q))).toBe(true));
    } finally {
      window.removeEventListener("popstate", onPop);
    }
  });

  it("una señal sin huecos no es un enlace", async () => {
    renderWith(ENTERPRISE);
    expect(await screen.findByText("Every device is reporting.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Every device is reporting/ })).toBeNull();
  });

  it("el KPI de compliance y la card de inventario abren la lista de SU señal", async () => {
    dashboardApi.getSignalGapDevices.mockResolvedValue({ signal: "x", label: "x", staleAfterDays: 3, entitled: true, truncated: false, devices: [] });
    renderWith(ENTERPRISE);
    fireEvent.click(await screen.findByRole("button", { name: /Compliance reporting/ }));
    expect(dashboardApi.getSignalGapDevices).toHaveBeenLastCalledWith("compliance");
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    const card = await screen.findByRole("region", { name: "Blind spots" });
    fireEvent.click(within(card).getByRole("button", { name: /See devices/ }));
    await waitFor(() => expect(dashboardApi.getSignalGapDevices).toHaveBeenLastCalledWith("inventory"));
  });
});
