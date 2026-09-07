// src/pages/DeviceManagement.header.test.jsx
//
// La cabecera de MDM / MAM: el botón "Report" y que el refresco funcione.
//
// Aquí el refresco es de una pieza —la página no tiene pestañas con carga
// propia: todo cuelga de un único `load` que trae la política del tenant y los
// equipos—, así que lo que hay que comprobar es que pulsar el botón SALE A LA
// RED. Con `httpGetJson` sirviendo de su caché de 60 s, volver a llamar a
// `load` no garantiza nada: es `RefreshControl` quien tira la caché antes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

let capabilities = { role: "ADMIN", permissions: ["device_management"] };
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

import DeviceManagement from "./DeviceManagement";

beforeEach(() => {
  capabilities = { role: "ADMIN", permissions: ["device_management"] };
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount(onNavigate = vi.fn()) {
  const calls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (request.method === "GET") calls.push(url.pathname);
      return HttpResponse.json({
        ok: true,
        items: [],
        groups: [],
        policy: { policy_version: 1, policy_hash: "h", policy_json: {} },
      });
    })
  );
  window.history.replaceState({}, "", "/?page=device-management");
  render(<ConfirmProvider><DeviceManagement onNavigate={onNavigate} /></ConfirmProvider>);
  return calls;
}

describe("MDM / MAM — cabecera", () => {
  it('el botón "Report" lleva a Reports con el informe preseleccionado', async () => {
    const onNavigate = vi.fn();
    mount(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(onNavigate).toHaveBeenCalledWith("reports");
    // No hay tipo "mdm" en el catálogo: los equipos gestionados son parte de
    // la flota, y el informe de flota es el que los cuenta.
    expect(new URL(window.location.href).searchParams.get("reportKey")).toBe("global.fleet-health");
  });

  it("va a la misma altura que el Refresh de al lado", async () => {
    mount();
    const report = await screen.findByRole("button", { name: /^report$/i });
    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    expect(report.className).not.toMatch(/sizeSmall/);
    expect(refresh.className).not.toMatch(/sizeSmall/);
  });

  it("a quien gestiona dispositivos pero NO es ADMIN/OWNER no se le ofrece", async () => {
    // `canManage` es la capacidad `device_management`; el informe pide ROL.
    // Son dos ejes distintos y aquí se cruzan: este rol entra a la página y
    // administra la política, pero el informe le daría "no disponible".
    capabilities = { role: "Mobile Operator", permissions: ["device_management"] };

    mount();

    expect(await screen.findByRole("button", { name: /^refresh$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
  });

  it("sin la capacidad no se entra a la página, y por tanto tampoco al informe", async () => {
    capabilities = { role: "ADMIN", permissions: [] };

    mount();

    expect(await screen.findByText(/don't have permission to view device management/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
  });
});

describe("MDM / MAM — el refresco sale a la red", () => {
  it("pulsar Refresh vuelve a pedir política y equipos", async () => {
    const calls = mount();

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const antes = calls.length;

    await userEvent.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(antes), { timeout: 3000 });
  });

  it("el control de auto-refresco está", async () => {
    mount();
    expect(await screen.findByLabelText(/auto refresh/i)).toBeTruthy();
  });
});
