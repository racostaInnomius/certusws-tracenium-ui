// src/pages/CryptoDiscovery.header.test.jsx
//
// La cabecera de Crypto Discovery: el botón "Report" y que el refresco alcance
// a las siete pestañas.
//
// Esta página llega ya bien cableada —todas sus pestañas reciben el nonce—,
// así que lo que se fija aquí es que siga así: es la clase de cosa que se
// rompe al añadir la pestaña número ocho, y no se nota, porque un botón de
// refrescar se comporta igual tanto si recarga como si no.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 1, tenantMember: { role: "USER", isActive: true, tenantId: 1 } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import CryptoDiscovery from "./CryptoDiscovery";

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
        ok: true, items: [], devices: [], certificates: [], anchors: [],
        summary: {}, facets: {}, total: 0,
      });
    })
  );
  window.history.replaceState({}, "", "/?page=cdp");
  render(<ConfirmProvider><CryptoDiscovery onNavigate={onNavigate} /></ConfirmProvider>);
  return calls;
}

describe("Crypto Discovery — cabecera", () => {
  it('el botón "Report" lleva a Reports con el CBOM, en JSON', async () => {
    const onNavigate = vi.fn();
    mount(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(onNavigate).toHaveBeenCalledWith("reports");
    const params = new URL(window.location.href).searchParams;
    // Esta página tiene informe PROPIO en el catálogo, como Patch Management:
    // no hereda el de flota.
    expect(params.get("reportKey")).toBe("cdp.cbom");
    // El CBOM sólo existe en JSON — es un formato de intercambio para la
    // herramienta del auditor, no un documento para leer.
    expect(params.get("reportFormat")).toBe("json");
  });

  it("se le ofrece a un miembro que NO es ADMIN/OWNER", async () => {
    // ⚠️ A propósito, y al revés que en las demás páginas: `cdp.cbom` no
    // declara `minRole`, así que el backend se lo sirve a cualquier miembro
    // activo con el plugin encendido. Esconderlo tras un rol se lo quitaría a
    // gente a la que el servidor sí contesta — la regresión que ADR-0011 fase
    // 3 vino a arreglar. (El mock de auth de este fichero es un USER.)
    mount();
    expect(await screen.findByRole("button", { name: /^report$/i })).toBeTruthy();
  });

  it("los tres botones de la fila van a la misma altura", async () => {
    mount();
    const issue = await screen.findByRole("button", { name: /issue certificate/i });
    const report = screen.getByRole("button", { name: /^report$/i });
    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    for (const b of [issue, report, refresh]) {
      expect(b.className).not.toMatch(/sizeSmall/);
    }
  });
});

describe("Crypto Discovery — el refresco alcanza a cada pestaña", () => {
  it.each([
    ["Dashboard"],
    ["Roadmap"],
    ["Explore"],
    ["Inventory"],
    ["Trust anchors"],
    ["Orphan keys"],
    ["Settings"],
  ])("la pestaña %s vuelve a pedir al pulsar Refresh", async (rotulo) => {
    const calls = mount();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("tab", { name: rotulo }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const antes = calls.length;

    // Algunas pestañas traen su propio "Refresh" dentro del panel; el de la
    // CABECERA es el primero en el DOM y es el que se prueba.
    await user.click(screen.getAllByRole("button", { name: /^refresh$/i })[0]);

    await waitFor(() => expect(calls.length).toBeGreaterThan(antes), { timeout: 3000 });
  });
});
