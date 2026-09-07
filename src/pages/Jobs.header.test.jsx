// src/pages/Jobs.header.test.jsx
//
// La cabecera de Jobs: el botón "Report" y que el refresco funcione.
//
// El refresco de esta página tiene historia: el auto-refresco estaba hecho a
// mano y venía APAGADO, y por eso el historial de trabajos se quedaba en
// "Pending" para siempre después de que el trabajo hubiera terminado — la
// tabla no volvía a preguntar. Se pasó al hook compartido; lo que se fija aquí
// es que el botón manual sale de verdad a la red, que con la caché de 60 s de
// `httpGetJson` no es gratis.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

let capabilities = { role: "ADMIN", permissions: ["jobs"] };
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

import Jobs from "./Jobs";

beforeEach(() => {
  capabilities = { role: "ADMIN", permissions: ["jobs"] };
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
        ok: true, items: [], jobs: [], devices: [], types: [], total: 0,
      });
    })
  );
  window.history.replaceState({}, "", "/?page=jobs");
  render(<ConfirmProvider><Jobs onNavigate={onNavigate} /></ConfirmProvider>);
  return calls;
}

describe("Jobs — cabecera", () => {
  it('el botón "Report" lleva a Reports con el informe preseleccionado', async () => {
    const onNavigate = vi.fn();
    mount(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(onNavigate).toHaveBeenCalledWith("reports");
    // No hay tipo "jobs" en el catálogo. El informe de flota cuenta los
    // trabajos del periodo con sus fallos, que es el resumen que esta página
    // no da fuera de la ventana que tienes delante.
    expect(new URL(window.location.href).searchParams.get("reportKey")).toBe("global.fleet-health");
  });

  it("va a la misma altura que el Refresh de al lado", async () => {
    mount();
    const report = await screen.findByRole("button", { name: /^report$/i });
    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    expect(report.className).not.toMatch(/sizeSmall/);
    expect(refresh.className).not.toMatch(/sizeSmall/);
  });

  it("a un miembro con la capacidad `jobs` pero sin ADMIN/OWNER no se le ofrece", async () => {
    // ⚠️ Esta página es visible para cualquier miembro con la capacidad
    // `jobs`, a propósito (ADR-0011 fase 3). El informe, en cambio, pide ROL:
    // son dos ejes distintos y aquí se cruzan de verdad.
    capabilities = { role: "Operator", permissions: ["jobs"] };

    mount();

    expect(await screen.findByRole("button", { name: /^refresh$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
  });
});

describe("Jobs — el refresco sale a la red", () => {
  it("pulsar Refresh vuelve a pedir EL HISTORIAL, no una petición cualquiera", async () => {
    // Se cuenta la ruta concreta del historial de trabajos y no el total: era
    // ésa la que se quedaba clavada en "Pending", y un contador global sube
    // igual aunque la tabla no se entere.
    const calls = mount();
    const esHistorial = (p) => /\/jobs(\?|$)/.test(p) || /tenants\/.*\/jobs/.test(p);

    await waitFor(() => expect(calls.some(esHistorial)).toBe(true));
    const antes = calls.filter(esHistorial).length;

    await userEvent.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(
      () => expect(calls.filter(esHistorial).length).toBeGreaterThan(antes),
      { timeout: 3000 }
    );
  });

  it("el control de auto-refresco está, y no viene apagado", async () => {
    // Venía APAGADO cuando estaba hecho a mano, y ése era el bug: el
    // historial se quedaba en "Pending" para siempre porque nadie volvía a
    // preguntar. El hook compartido trae 60 s por defecto.
    mount();
    const box = await screen.findByLabelText(/auto refresh/i);
    expect(box).toBeTruthy();
    expect(box.value ?? box.textContent).not.toMatch(/^off$/i);
  });
});
