// src/pages/PatchManagement.header.test.jsx
//
// La cabecera de Patch Management: el botón "Report" y que el refresco alcance
// a lo que la página enseña, no sólo a lo que la página carga.
//
// `refreshAll` eran dos llamadas —resumen y equipos— y con eso se daba por
// refrescada. Quedaban fuera la cola de prioridad y las pestañas con carga
// propia (Third-party, Vulnerabilities, hallazgos, configuración de
// seguridad): con cualquiera de ellas delante, pulsar Refresh no hacía nada
// visible. Y no se nota, porque el botón se comporta igual tanto si recarga
// como si no.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

beforeEach(() => {
  capabilities = { role: "ADMIN", permissions: ["patch_management"] };
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
        devices: [],
        findings: [],
        catalog: [{ key: "pmp", required: false }],
        policy: { policy_version: 1, policy_hash: "h", policy_json: { plugins: { enabled: ["amp", "pmp"] } } },
        summary: {},
        total: 0,
      });
    })
  );
  window.history.replaceState({}, "", "/?page=patch");
  render(<ConfirmProvider><PatchManagement onNavigate={onNavigate} /></ConfirmProvider>);
  return calls;
}

describe("Patch Management — cabecera", () => {
  it('el botón "Report" lleva a Reports con el informe DE ESTA página', async () => {
    const onNavigate = vi.fn();
    mount(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(onNavigate).toHaveBeenCalledWith("reports");
    // ⭐ Aquí NO se hereda el informe de flota: el catálogo tiene un tipo
    // propio, `pmp.cve-exposure`, que es exactamente lo que se administra en
    // esta pantalla.
    expect(new URL(window.location.href).searchParams.get("reportKey")).toBe("pmp.cve-exposure");
  });

  it("va a la misma altura que el Refresh de al lado", async () => {
    mount();
    const report = await screen.findByRole("button", { name: /^report$/i });
    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    expect(report.className).not.toMatch(/sizeSmall/);
    expect(refresh.className).not.toMatch(/sizeSmall/);
  });

  it("a quien no es ADMIN/OWNER no se le ofrece", async () => {
    // El tipo declara `minRole: ["ADMIN","OWNER"]`. Un rol con la capacidad
    // `patch_management` pero sin ser administrador vería un botón que termina
    // en "no disponible".
    capabilities = { role: "Patch Operator", permissions: ["patch_management"] };

    mount();

    expect(await screen.findByRole("button", { name: /^refresh$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
  });
});

describe("Patch Management — el refresco alcanza a las pestañas con carga propia", () => {
  it.each([
    [/third.party/i, /third-party/i],
    [/vulnerabilit/i, /vulnerab|cve/i],
  ])("la pestaña %s vuelve a pedir al pulsar Refresh", async (pestana, rutaEsperada) => {
    const calls = mount();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("tab", { name: pestana }));
    await waitFor(() => expect(calls.some((p) => rutaEsperada.test(p))).toBe(true));
    const antes = calls.filter((p) => rutaEsperada.test(p)).length;

    // Estas pestañas traen su propio "Refresh" dentro del panel, así que hay
    // dos en la página. El de la CABECERA es el primero en el DOM y es el que
    // se prueba: el que tiene que alcanzar a todas.
    await user.click(screen.getAllByRole("button", { name: /^refresh$/i })[0]);

    await waitFor(
      () => expect(calls.filter((p) => rutaEsperada.test(p)).length).toBeGreaterThan(antes),
      { timeout: 3000 }
    );
  });
});
