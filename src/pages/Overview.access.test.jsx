// src/pages/Overview.access.test.jsx
//
// El Overview según el ROL, con el AppShell de verdad alrededor — que es quien
// abre el diálogo "Insufficient permissions".
//
// 3-oct-2026: el rol "App Review" (sólo `enrollment`) aterrizaba en el
// Overview y le saltaba "You don't have permission to use Remote Control".
// El Overview pedía cada card por PLAN, nunca por capacidad; cada 403
// PERMISSION_DENIED disparaba el evento global y el diálogo enseñaba el
// último. Aquí:
//
//   · sin la capacidad, la petición no se hace (ni el diálogo, ni la card);
//   · un 403 de una carga de fondo nunca abre el diálogo;
//   · un rol sin nada en el Overview ve sus páginas en vez de cards vacías;
//   · el ADMIN sigue cargándolo todo.
//
// El backend se emula con las mismas puertas que sus rutas (ver
// OVERVIEW_GATES en api/overview.js): sin la capacidad, 403 PERMISSION_DENIED
// con el mensaje de roles-gate.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { server, http, HttpResponse } from "../test/msw/server";
import { PERMISSION_DENIED_EVENT, invalidateApiCache } from "../api/http";
import { clearCachedFetch } from "../hooks/useCachedFetch";

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: {
      tenantId: "1",
      email: "review@tracenium.test",
      tenantMember: { role: "MEMBER", isActive: true, tenantId: "1" },
      bootstrap: { tenantId: "1" },
    },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMsp: () => ({ inPortfolioMode: false, activeClient: null, isMsp: false }),
  useMspOptional: () => null,
}));
vi.mock("../msp/TenantSwitcher", () => ({ default: () => null }));
vi.mock("../msp/HierarchyBreadcrumb", () => ({ default: () => null }));
vi.mock("../layout/Sidebar", () => ({ default: () => null }));
vi.mock("../layout/Topbar", () => ({
  default: () => <div data-testid="topbar" />,
  TOPBAR_HEIGHT: 56,
  CHROME_LINE_WIDTH: 3,
}));
vi.mock("../api/licensing", () => ({
  getLicenseState: vi.fn(async () => ({ ok: true, state: "active" })),
}));
// Business: los tres bloques montados, para que cada petición con puerta
// tenga su card.
vi.mock("../hooks/usePluginCatalog", () => ({
  usePluginCatalog: () => ({
    entitled: new Set(["amp", "sdp", "scp", "rcp", "pmp", "cdp"]),
    loading: false,
  }),
}));
// La página real para `overview`; cualquier otra, su nombre (para ver adónde
// llevan los botones del panel).
vi.mock("../layout/pageRegistry", () => ({
  renderPage: (page, { onNavigate }) =>
    page === "overview" ? <Overview onNavigate={onNavigate} /> : <div data-testid="pagina">{page}</div>,
  PAGES: [],
}));
// Recharts mide 0×0 en jsdom y no aporta nada: lo que se prueba es qué se
// pide y qué se monta. La dona de composición dice si se pintaría.
//
// ⚠️ Los módulos de cada gráfica, no `charts.lazy`: las cinco lazy() del
// Overview importan ese módulo a la vez, y sólo la primera recibía el mock —
// las demás cargaban el componente real.
vi.mock("../components/Overview/FleetComposition", () => ({
  default: ({ showComposition = true }) => (
    <div data-testid="fleet-composition">{showComposition ? "composition donut" : null}</div>
  ),
}));
vi.mock("../components/Overview/AuditTimeseriesChart", () => ({ default: () => <div data-testid="audit-chart" /> }));
vi.mock("../components/Overview/JobsTimeseriesChart", () => ({ default: () => <div data-testid="jobs-chart" /> }));
vi.mock("../components/Overview/PatchCoverageCard", () => ({ default: () => <div data-testid="patch-recency" /> }));
vi.mock("../components/Overview/ComplianceTrendCard", () => ({ default: () => <div data-testid="compliance-trend" /> }));

import AppShell from "../layout/AppShell";
import Overview from "./Overview";

const ALL = [
  "assets_view", "software_delivery", "reports", "jobs", "audit_log", "pki", "security_compliance",
  "remote_control", "patch_management", "crypto_discovery", "alerts", "enrollment", "device_management",
];

// Ruta → capacidad que exige en el backend, y lo que devuelve con ella.
const GATED = [
  ["/api/v1/dashboard/hardware-inventory/summary", "assets_view", "Asset Management", { fleet: { total: 3, composition: {} } }],
  ["/api/v1/dashboard/signal-coverage", "assets_view", "Asset Management", {
    fleet: 12,
    devicesWithAnyGap: 1,
    signals: [{ key: "inventory", label: "Hardware & OS inventory", plugin: "amp", entitled: true, staleAfterDays: 3, reporting: 11, stale: 1, never: 0, blind: 1, blindPct: 8.3 }],
  }],
  ["/api/v1/security/audit/timeseries", "audit_log", "Audit Log", { windowDays: 7, buckets: [] }],
  ["/api/v1/security/certificates/expiring", "pki", "PKI", { count: 0, certificates: [] }],
  ["/api/v1/reports/runs", "reports", "Reports", { total: 2, runs: [] }],
  ["/api/v1/reports/schedules", "reports", "Reports", { schedules: [] }],
  ["/api/v1/remote-control/summary", "remote_control", "Remote Control", { summary: { readyNow: 4, fleetTotal: 12, sessionsLast7d: 3 } }],
  ["/api/v1/cdp/summary", "crypto_discovery", "Crypto Discovery", { summary: { devicesReporting: 5, totalCerts: 40 } }],
];
const GATED_PATHS = GATED.map(([path]) => path);

const UNGATED = {
  "/api/v1/dashboard/summary": { fleetDevices: 12, totalHosts: 12, inactiveAssets7d: 0 },
  "/api/v1/security/compliance/summary": { summary: { avgScore: 82, devicesReporting: 10, openFindings: { critical: 1, high: 2 } } },
  "/api/v1/patch-management/summary": { summary: { devicesReporting: 9, statusBreakdown: {}, severityBreakdown: {} } },
  "/api/v1/orchestrator/jobs/timeseries": { windowDays: 7, buckets: [] },
};

let role;
let denyEverythingGated;
let capabilitiesFail;
let capabilitiesHang;
let requested;
let denials;
const onDenied = (event) => denials.push(event.detail);

function mountBackend() {
  server.use(
    http.get(/\/api\/v1\/tenants\/1\/roles\/me\/capabilities$/, async () => {
      if (capabilitiesHang) await new Promise(() => {}); // no contesta nunca
      return capabilitiesFail
        ? HttpResponse.json({ error: "INTERNAL" }, { status: 500 })
        : HttpResponse.json({ role: role.name, permissions: role.permissions });
    }),
    http.all(/\/api\//, ({ request }) => {
      const { pathname } = new URL(request.url);
      requested.push(pathname);
      const gated = GATED.find(([path]) => path === pathname);
      if (gated) {
        const [, capability, label, body] = gated;
        if (denyEverythingGated || !role.permissions.includes(capability)) {
          return HttpResponse.json(
            { error: "PERMISSION_DENIED", message: `You don't have permission to use ${label}. Ask a tenant admin to grant it.` },
            { status: 403 }
          );
        }
        return HttpResponse.json(body);
      }
      return HttpResponse.json(UNGATED[pathname] ?? {});
    })
  );
}

function renderOverview() {
  window.history.replaceState({}, "", "/?page=overview");
  mountBackend();
  return render(<AppShell />);
}

/** Espera a que los tres bloques hayan cargado: después ya no llega nada. */
async function settled() {
  // Core: el sello de la cabecera sale cuando su slice ha resuelto.
  await screen.findByText(/^Last refresh/);
  // Security: el KPI de compliance viene de una lectura sin puerta.
  await screen.findByText("Critical findings");
  // Operations: Patch management, también sin puerta, con sus datos.
  const patch = await screen.findByRole("region", { name: "Patch management" });
  await within(patch).findByText("9 devices reporting");
}

beforeEach(() => {
  role = { name: "OWNER", permissions: ALL };
  denyEverythingGated = false;
  capabilitiesFail = false;
  capabilitiesHang = false;
  requested = [];
  denials = [];
  window.addEventListener(PERMISSION_DENIED_EVENT, onDenied);
});

afterEach(() => {
  window.removeEventListener(PERMISSION_DENIED_EVENT, onDenied);
  cleanup();
  clearCachedFetch();
  window.history.replaceState({}, "", "/");
});

describe("Overview según el rol", () => {
  it("⭐ «App Review» (sólo enrollment): ni diálogo ni peticiones del Overview; sus páginas, con botón", async () => {
    role = { name: "App Review", permissions: ["enrollment"] };
    renderOverview();

    const panel = await screen.findByRole("region", { name: "Nothing on the Overview is part of your role" });
    expect(panel).toHaveTextContent("Your role (App Review)");
    expect(within(panel).getByRole("button", { name: "MDM / MAM" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Device Enrollment" })).toBeTruthy();

    // Ninguna card vacía debajo: el panel ES la página.
    expect(screen.queryByRole("heading", { name: "Fleet & operations" })).toBeNull();
    expect(requested).not.toContain("/api/v1/remote-control/summary");
    for (const path of GATED_PATHS) expect(requested).not.toContain(path);
    // Ni las lecturas sin puerta: no hay bloque que las pinte.
    expect(requested).not.toContain("/api/v1/orchestrator/jobs/timeseries");

    expect(denials).toEqual([]);
    expect(screen.queryByText("Insufficient permissions")).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "MDM / MAM" }));
    await waitFor(() => expect(screen.getByTestId("pagina")).toHaveTextContent("device-management"));
  });

  it("⭐ un rol con el Overview pero sin ninguna capacidad con puerta: ninguna de esas peticiones, ni sus cards", async () => {
    role = { name: "Ops", permissions: ["jobs"] };
    renderOverview();
    await settled();

    // Cada puerta de OVERVIEW_GATES, una a una.
    for (const path of GATED_PATHS) expect(requested).not.toContain(path);
    // Lo que no tiene puerta se sigue pidiendo.
    expect(requested).toContain("/api/v1/orchestrator/jobs/timeseries");
    expect(requested).toContain("/api/v1/dashboard/summary");

    expect(denials).toEqual([]);
    expect(screen.queryByText("Insufficient permissions")).toBeNull();

    // Las gráficas comparten un chunk perezoso: con la de Jobs ya pintada, una
    // de Audit montada también lo estaría — si no, su ausencia no probaría nada.
    expect(await screen.findByTestId("jobs-chart")).toBeTruthy();
    // Y sin card que lea el hueco como "nada todavía" o "no se pudo cargar".
    expect(screen.queryByRole("region", { name: "Reports" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Crypto discovery" })).toBeNull();
    expect(screen.queryByTestId("audit-chart")).toBeNull();
    expect(screen.queryByText("Remote-ready")).toBeNull();
    expect(screen.queryByRole("button", { name: /Blind spots/ })).toBeNull();
    expect(screen.getByTestId("fleet-composition")).not.toHaveTextContent("composition donut");
    // La página no es el panel: este rol sí tiene algo aquí.
    expect(screen.queryByRole("region", { name: "Nothing on the Overview is part of your role" })).toBeNull();
  });

  it("⭐ ADMIN carga todos los widgets", async () => {
    role = { name: "ADMIN", permissions: ALL };
    renderOverview();
    await settled();

    await waitFor(() => {
      for (const path of GATED_PATHS) expect(requested).toContain(path);
    });
    expect(await screen.findByRole("region", { name: "Reports" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Crypto discovery" })).toBeTruthy();
    expect(await screen.findByTestId("audit-chart")).toBeTruthy();
    expect(await screen.findByText("Remote-ready")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Blind spots/ })).toBeTruthy();
    expect(screen.getByTestId("fleet-composition")).toHaveTextContent("composition donut");
    expect(denials).toEqual([]);
  });

  it("⚠️ un 403 de una carga de fondo no abre el diálogo aunque el rol diga que puede", async () => {
    // requireCapability también deniega con el plugin en el plan pero sin
    // activar en la política guardada del tenant — y eso le pasa a un ADMIN.
    role = { name: "ADMIN", permissions: ALL };
    denyEverythingGated = true;
    renderOverview();
    await settled();

    await waitFor(() => {
      for (const path of GATED_PATHS) expect(requested).toContain(path);
    });
    // La card del rechazo lo dice en su sitio.
    const cdp = await screen.findByRole("region", { name: "Crypto discovery" });
    await within(cdp).findByText(/Couldn.t load/);

    expect(denials).toEqual([]);
    expect(screen.queryByText("Insufficient permissions")).toBeNull();
  });

  it("⚠️ una capacidad perdida no se pinta desde la caché: la clave no lleva el rol y el slice guardado sí trae el slot", async () => {
    // Primero ADMIN: llena la caché de 24 h con todos los slots.
    role = { name: "ADMIN", permissions: ALL };
    const first = renderOverview();
    await settled();
    expect(await screen.findByRole("button", { name: /Blind spots/ })).toBeTruthy();
    first.unmount();
    // Sólo la respuesta del rol, que la capa http guarda 60 s; la caché del
    // Overview (useCachedFetch) se queda como estaba.
    invalidateApiCache("/api/v1/tenants/1/roles/me/capabilities");

    // El mismo usuario, ya sin nada con puerta, dentro de los 60 s en que la
    // entrada sigue fresca y no se revalida: la caché trae Reports, CDP, RCP,
    // la composición y la cobertura, y nada de eso se pinta.
    role = { name: "Ops", permissions: ["jobs"] };
    renderOverview();
    await settled();
    expect(await screen.findByTestId("jobs-chart")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Reports" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Crypto discovery" })).toBeNull();
    expect(screen.queryByTestId("audit-chart")).toBeNull();
    expect(screen.queryByText("Remote-ready")).toBeNull();
    expect(screen.queryByRole("button", { name: /Blind spots/ })).toBeNull();
    expect(screen.queryByTestId("coverage-headline")).toBeNull();
    expect(screen.getByTestId("fleet-composition")).not.toHaveTextContent("composition donut");
  });

  it("mientras se pregunta por el rol, las cards esperan cargando — no dicen «nada todavía»", async () => {
    capabilitiesHang = true;
    renderOverview();

    const patch = await screen.findByRole("region", { name: "Patch management" });
    expect(within(patch).queryByText(/No device has reported patch data yet/)).toBeNull();
    expect(screen.queryByText(/No reports generated yet/)).toBeNull();
    // Y mientras tanto no se ha pedido nada de los bloques.
    expect(requested).not.toContain("/api/v1/dashboard/agent-versions");
    expect(requested).not.toContain("/api/v1/patch-management/summary");
  });

  it("si no se puede saber el rol, se pide todo como antes — sin diálogo y sin decir que el rol no ve nada", async () => {
    capabilitiesFail = true;
    role = { name: "App Review", permissions: ["enrollment"] };
    renderOverview();
    await settled();

    await waitFor(() => {
      for (const path of GATED_PATHS) expect(requested).toContain(path);
    });
    expect(screen.queryByRole("region", { name: "Nothing on the Overview is part of your role" })).toBeNull();
    expect(denials).toEqual([]);
    expect(screen.queryByText("Insufficient permissions")).toBeNull();
  });
});
