// src/pages/PatchManagement.campaign.test.jsx
//
// El estado de CAMPAÑA en la página: la tira de resumen y las dos columnas.
// Lo que se prueba aquí no es el maquetado, es que la página no afirme cosas
// que el backend no dijo.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

let capabilities = { role: "ADMIN", permissions: ["patch_management"] };
vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve(capabilities),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 1, tenantMember: { role: "ADMIN", isActive: true, tenantId: 1 } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import PatchManagement from "./PatchManagement";
import { clearCachedFetch } from "../hooks/useCachedFetch";

const DEVICES = [
  { agentId: "a-1", hostname: "MSIG-WSUS", platform: "windows", overallStatus: "healthy", missingCount: 0, criticalCount: 0, rebootRequired: false, collectedAtUtc: "2026-09-12T00:00:00Z" },
  { agentId: "a-2", hostname: "MSIG-TSPDC", platform: "windows", overallStatus: "updates_available", missingCount: 5, criticalCount: 2, rebootRequired: false, collectedAtUtc: "2026-09-12T00:00:00Z" },
  { agentId: "a-3", hostname: "DESKTOP-PC01", platform: "windows", overallStatus: "reboot_required", missingCount: 1, criticalCount: 0, rebootRequired: true, collectedAtUtc: "2026-09-12T00:00:00Z" },
];

const CAMPAIGN = {
  ok: true,
  fleet: { enrolled: 54, reporting: 53 },
  devices: [
    {
      deviceId: "a-1",
      state: "patched",
      snapshotApplies: true,
      patch: { jobId: "j1", status: "completed", startedAt: "2026-09-11T05:00:00Z", finishedAt: "2026-09-11T05:11:00Z", lastError: null, rebootRequested: false, returnedFromReboot: null },
      snapshot: { id: 9, outcome: "cleaned", onDatastore: false, moref: "snapshot-14168", reason: null, reasonDetail: null, takenAt: "2026-09-11T05:00:00Z", removedAt: "2026-09-11T05:12:00Z" },
    },
    {
      deviceId: "a-2",
      state: "failed",
      snapshotApplies: true,
      patch: { jobId: "j2", status: "failed", startedAt: "2026-09-08T13:00:00Z", finishedAt: "2026-09-08T14:00:00Z", lastError: "patch_install failed; installer 0x80d02002", rebootRequested: true, returnedFromReboot: null },
      snapshot: { id: 10, outcome: "rejected", onDatastore: false, moref: null, reason: "insufficient_capacity", reasonDetail: "4.06 TB libres de 21.83 TB (18%), umbral 20%", takenAt: null, removedAt: null },
    },
    { deviceId: "a-3", state: "never_ran", snapshotApplies: false, patch: null, snapshot: null },
  ],
  totals: {
    byState: { never_ran: 50, awaiting_window: 0, awaiting_snapshot: 0, in_flight: 0, patched: 2, awaiting_reboot: 1, failed: 1, timed_out: 0, cancelled: 0, unknown: 0 },
    snapshots: { held: 0, removed: 1, rejected: 1, failed: 0, pending: 0, other: 0 },
  },
};

beforeEach(() => {
  capabilities = { role: "ADMIN", permissions: ["patch_management"] };
  // ⚠️ `useCachedFetch` guarda por clave y la clave es la misma en todos estos
  // tests, así que sin esto el cuarto leería la respuesta del primero y estaría
  // comprobando la caché, no la página.
  clearCachedFetch();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount({ campaign = CAMPAIGN } = {}) {
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/patch-management/campaign-status")) {
        return HttpResponse.json(campaign);
      }
      const items = url.pathname.endsWith("/patch-management/devices") ? DEVICES : [];
      return HttpResponse.json({
        ok: true,
        items,
        devices: [],
        findings: [],
        catalog: [{ key: "pmp", required: false }],
        policy: { policy_version: 1, policy_hash: "h", policy_json: { plugins: { enabled: ["amp", "pmp"] } } },
        summary: {},
        total: items.length,
      });
    })
  );
  window.history.replaceState({}, "", "/?page=patch");
  render(<ConfirmProvider><PatchManagement onNavigate={vi.fn()} /></ConfirmProvider>);
}

const grid = () => screen.getByRole("grid");

describe("Patch Management — estado de campaña", () => {
  it("⭐ la tira dice el denominador real, que es la noticia", async () => {
    // «2 parcheados» no significa nada sin «de 54 enrolados», y con 50 sin un
    // solo intento la cobertura es el dato principal, no un adorno.
    mount();
    expect(
      await screen.findByText(/4 of 54 enrolled devices have had a patch job/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/50 never patched/i)).toBeInTheDocument();
    expect(screen.getByText(/1 enrolled but not reporting/i)).toBeInTheDocument();
  });

  it("los estados accionables van primero y «nunca parcheado» no es un chip", async () => {
    mount();
    await screen.findByText(/4 of 54 enrolled/i);
    expect(screen.getByText("Failed: 1")).toBeInTheDocument();
    expect(screen.getByText("Awaiting reboot: 1")).toBeInTheDocument();
    expect(screen.getByText("Patched: 2")).toBeInTheDocument();
    expect(screen.queryByText(/Never patched: /)).toBeNull();
  });

  it("cada equipo enseña su estado y su snapshot", async () => {
    mount();
    await waitFor(() => expect(within(grid()).getByText("MSIG-WSUS")).toBeInTheDocument());
    expect(within(grid()).getByText("Patched")).toBeInTheDocument();
    expect(within(grid()).getByText("Removed")).toBeInTheDocument();
    expect(within(grid()).getByText("Failed")).toBeInTheDocument();
    expect(within(grid()).getByText("Rejected")).toBeInTheDocument();
    // El PC no pasa por gateway: N/A, no una carencia.
    expect(within(grid()).getByText("Never patched")).toBeInTheDocument();
    expect(within(grid()).getByText("N/A")).toBeInTheDocument();
  });

  it("🔴 el PC retenido al entregar explica la espera en el tooltip, sin el código crudo", async () => {
    // El backend devuelve a awaiting_window un patch_install que iba a salir con
    // la ventana cerrada (PC encendido a las 08:00) y deja un CÓDIGO en last_error.
    const held = {
      ...CAMPAIGN,
      devices: CAMPAIGN.devices.map((d) =>
        d.deviceId === "a-3"
          ? {
              ...d,
              state: "awaiting_window",
              patch: { jobId: "j3", status: "awaiting_window", startedAt: null, finishedAt: null, lastError: "held:maintenance_window_closed", rebootRequested: false, returnedFromReboot: null },
            }
          : d
      ),
    };
    mount({ campaign: held });
    await waitFor(() => expect(within(grid()).getByText("Waiting for window")).toBeInTheDocument());

    fireEvent.mouseOver(within(grid()).getByText("Waiting for window"));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(/maintenance window had closed/i);
    expect(tip).not.toHaveTextContent("held:maintenance_window_closed");
  });

  it("⚠️ sin respuesta de campaña la página sigue, sin inventar ceros", async () => {
    // Una respuesta vacía diría «0 of 0 enrolled devices»: una afirmación sobre
    // la flota, y encima falsa.
    mount({ campaign: { ok: true, devices: [], fleet: { enrolled: 0, reporting: 0 }, totals: {} } });
    await waitFor(() => expect(within(grid()).getByText("MSIG-WSUS")).toBeInTheDocument());
    expect(screen.queryByText(/enrolled devices have had a patch job/i)).toBeNull();
  });
});

describe("Patch Management — las tarjetas filtran la tabla de equipos", () => {
  const rowNames = () => within(grid()).queryAllByText(/^(MSIG-WSUS|MSIG-TSPDC|DESKTOP-PC01)$/).map((n) => n.textContent);

  it("⭐ «Reboot pending» deja sólo los equipos con reinicio pendiente, y lo dice", async () => {
    mount();
    await waitFor(() => expect(within(grid()).getByText("MSIG-WSUS")).toBeInTheDocument());

    // Se guarda la TARJETA antes de pulsar: al filtrar aparece también el chip
    // «Reboot pending», que MUI pinta como botón con el mismo nombre.
    const card = screen.getByRole("button", { name: /Reboot pending/i });
    fireEvent.click(card);

    await waitFor(() => expect(rowNames()).toEqual(["DESKTOP-PC01"]));
    // El filtro activo, a la vista: una tabla recortada sin explicación parece
    // una flota que ha perdido equipos.
    expect(screen.getByText("1 of 3 devices")).toBeInTheDocument();
    expect(card).toHaveAttribute("aria-pressed", "true");
  });

  it("⚠️ «Critical / Important» filtra EQUIPOS y el rótulo lo aclara", async () => {
    mount();
    await waitFor(() => expect(within(grid()).getByText("MSIG-WSUS")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Critical \/ Important/i }));

    await waitFor(() => expect(rowNames()).toEqual(["MSIG-TSPDC"]));
    expect(screen.getByText("Devices with critical / important patches")).toBeInTheDocument();
  });

  it("pulsar la tarjeta activa, «Devices reporting» o el aspa del chip devuelven la flota entera", async () => {
    mount();
    await waitFor(() => expect(within(grid()).getByText("MSIG-WSUS")).toBeInTheDocument());

    const healthy = screen.getByRole("button", { name: /Healthy/i });
    fireEvent.click(healthy);
    await waitFor(() => expect(rowNames()).toEqual(["MSIG-WSUS"]));
    fireEvent.click(healthy);
    await waitFor(() => expect(rowNames()).toHaveLength(3));

    fireEvent.click(screen.getByRole("button", { name: /Total missing/i }));
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    fireEvent.click(screen.getByText("Devices reporting"));
    await waitFor(() => expect(rowNames()).toHaveLength(3));
  });
});
