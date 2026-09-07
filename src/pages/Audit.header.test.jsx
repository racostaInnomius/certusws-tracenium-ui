// src/pages/Audit.header.test.jsx
//
// La cabecera de Audit: el botón "Report" que sustituye a los exports de CSV y
// JSON, y que el refresco funcione.
//
// Los dos botones que se van serializaban las filas YA CARGADAS desde el
// navegador. Dos problemas, y el segundo es el gordo:
//
//   1. Exportaban la PÁGINA, no la consulta. Con la paginación en 25 filas, el
//      "export" de una investigación de 4.000 eventos se llevaba 25 y no lo
//      decía en ninguna parte.
//   2. No dejaban rastro: un fichero con el rastro de auditoría del tenant
//      salía del portal sin constar quién se lo llevó — en la página cuyo
//      oficio es exactamente responder a esa pregunta.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";

const MOCK_AUTH = {
  tenantId: "1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
  email: "op@tracenium.test",
};
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false, refreshAuth: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import Audit from "./Audit";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.history.replaceState({}, "", "/");
});

function mount(onNavigate = vi.fn()) {
  const calls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (request.method === "GET") calls.push(url.pathname);
      return HttpResponse.json({
        ok: true, items: [], total: 0, permissions: ["audit_log"], facets: {}, summary: {},
      });
    })
  );
  window.history.replaceState({}, "", "/?page=audit");
  render(<Audit onNavigate={onNavigate} />);
  return calls;
}

describe("Audit — cabecera", () => {
  it("ya NO hay botones de CSV ni de JSON", async () => {
    // Se afirma su AUSENCIA: si vuelven, vuelve el fichero de auditoría que
    // sale sin dejar constancia y que además sólo lleva la página visible.
    mount();

    await screen.findByRole("button", { name: /^report$/i });
    expect(screen.queryByRole("button", { name: /^csv$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^json$/i })).toBeNull();
  });

  it('el botón "Report" lleva a Reports con el rastro de auditoría, en CSV', async () => {
    const onNavigate = vi.fn();
    mount(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(onNavigate).toHaveBeenCalledWith("reports");
    const params = new URL(window.location.href).searchParams;
    expect(params.get("reportKey")).toBe("audit.events");
    // `audit.events` sólo declara CSV en el registro.
    expect(params.get("reportFormat")).toBe("csv");
  });

  it("los filtros de la pantalla viajan con el informe", async () => {
    // Lo que los exports viejos hacían bien —respetar lo que estás mirando— no
    // se pierde al pasar por el motor. Las claves de `queryParams` son las
    // mismas que lee `parseAuditQuery` en el backend, así que el CSV cubre la
    // consulta y no el rastro entero.
    const onNavigate = vi.fn();
    mount(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    const enviados = JSON.parse(
      new URL(window.location.href).searchParams.get("reportParams") || "{}"
    );
    // El carril siempre va (tiene valor por defecto); lo que se fija es que
    // los filtros se manden, no cuáles estén puestos en este montaje.
    expect(Object.keys(enviados)).toContain("lane");
  });

  it("va a la misma altura que el Refresh de al lado", async () => {
    mount();
    const report = await screen.findByRole("button", { name: /^report$/i });
    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    expect(report.className).not.toMatch(/sizeSmall/);
    expect(refresh.className).not.toMatch(/sizeSmall/);
  });
});

describe("Audit — el refresco sale a la red", () => {
  it("pulsar Refresh vuelve a pedir LOS EVENTOS", async () => {
    // La ruta concreta, no el total de peticiones: un contador global sube
    // igual aunque la tabla no se entere.
    const calls = mount();
    const esEventos = (p) => /\/audit\/events/.test(p);

    await waitFor(() => expect(calls.some(esEventos)).toBe(true));
    const antes = calls.filter(esEventos).length;

    await userEvent.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(
      () => expect(calls.filter(esEventos).length).toBeGreaterThan(antes),
      { timeout: 3000 }
    );
  });

  it("el control de auto-refresco está", async () => {
    mount();
    expect(await screen.findByLabelText(/auto refresh/i)).toBeTruthy();
  });
});
