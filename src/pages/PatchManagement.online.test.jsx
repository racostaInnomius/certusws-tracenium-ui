// src/pages/PatchManagement.online.test.jsx
//
// La columna "Online" de la tabla de equipos.
//
// Importa más aquí que en ninguna otra pantalla: un parche no se instala en un
// equipo que no responde, así que una fila que dice "5 actualizaciones
// pendientes" significa una cosa muy distinta según el equipo esté escuchando
// o no. Antes había que irse a Asset Management a averiguarlo.
//
// El dato sale de `/orchestrator/devices-connected` —sesiones gRPC vivas—, la
// MISMA fuente que Asset Management y el Hero de Overview. No de un
// `last_heartbeat`: ese lo sobrescriben los barridos y sostiene "online" con
// el agente muerto.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve({ role: "ADMIN", permissions: ["patch_management"] }),
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

const DEVICES = [
  { agentId: "a-1", hostname: "Msig13", platform: "windows", overallStatus: "updates_available", missingCount: 5, rebootRequired: false, collectedAtUtc: "2026-09-08T00:00:00Z" },
  { agentId: "a-2", hostname: "MSIG-WSUS", platform: "windows", overallStatus: "healthy", missingCount: 0, rebootRequired: false, collectedAtUtc: "2026-09-08T00:00:00Z" },
];

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

/** @param conectados ids que devuelve `/orchestrator/devices-connected`. */
function mount(conectados = []) {
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/orchestrator/devices-connected")) {
        return HttpResponse.json({ ok: true, deviceIds: conectados, count: conectados.length });
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
const filaDe = (hostname) => within(grid()).getByText(hostname).closest('[role="row"]');

describe("Patch Management — columna Online", () => {
  it("la columna existe y se llama igual que en Asset Management", async () => {
    // El mismo rótulo a propósito: dos pantallas del mismo portal no pueden
    // llamar de dos maneras al mismo hecho.
    mount();
    await waitFor(() => expect(within(grid()).getByText("Msig13")).toBeInTheDocument());

    expect(within(grid()).getByRole("columnheader", { name: "Online" })).toBeInTheDocument();
  });

  it("⭐ pinta verde el conectado y gris el que no, en su fila", async () => {
    mount(["a-1"]);
    await waitFor(() => expect(within(grid()).getByText("Msig13")).toBeInTheDocument());

    // `OnlineDot` expone el estado por su nombre accesible — la única forma de
    // afirmarlo sin depender del color, que es una decisión del tema.
    await waitFor(() =>
      expect(within(filaDe("Msig13")).getByLabelText("Online")).toBeInTheDocument()
    );
    expect(within(filaDe("MSIG-WSUS")).getByLabelText("Offline")).toBeInTheDocument();
  });

  it("un fallo del endpoint deja los puntos en gris, no rompe la tabla", async () => {
    // La tabla es de parches; que no se sepa quién está conectado no puede
    // llevarse por delante lo que sí se sabe.
    server.use(
      http.all(/.*\/api\/.*/, ({ request }) => {
        const url = new URL(request.url);
        if (url.pathname.endsWith("/orchestrator/devices-connected")) {
          return new HttpResponse(null, { status: 500 });
        }
        const items = url.pathname.endsWith("/patch-management/devices") ? DEVICES : [];
        return HttpResponse.json({
          ok: true, items, devices: [], findings: [],
          catalog: [{ key: "pmp", required: false }],
          policy: { policy_version: 1, policy_hash: "h", policy_json: { plugins: { enabled: ["amp", "pmp"] } } },
          summary: {}, total: items.length,
        });
      })
    );
    window.history.replaceState({}, "", "/?page=patch");
    render(<ConfirmProvider><PatchManagement onNavigate={vi.fn()} /></ConfirmProvider>);

    await waitFor(() => expect(within(grid()).getByText("Msig13")).toBeInTheDocument());
    expect(within(filaDe("Msig13")).getByLabelText("Offline")).toBeInTheDocument();
  });
});
