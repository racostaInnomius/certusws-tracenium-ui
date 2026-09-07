// src/pages/SoftwareDelivery.header.test.jsx
//
// La cabecera de Software Delivery: el botón "Report" y el control de
// refresco, los mismos que ya tenía Asset Management.
//
// El refresco NO es cosmético aquí. La página son cuatro pestañas con su
// propia carga, y un botón que sólo refrescara la que su autor tenía delante
// sería peor que no tenerlo: el operador vería datos viejos creyendo que
// acaba de actualizarlos. Por eso el nonce llega a las cuatro y estos tests
// comprueban que la pestaña montada vuelve a pedir.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, respond } from "../test/msw/server";
import { http, HttpResponse } from "msw";

const MOCK_AUTH = {
  tenantId: "1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
  email: "op@tracenium.test",
};
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false, refreshAuth: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));

// El rol EFECTIVO lo da el servidor por este endpoint; la página lo usa para
// decidir si ofrece el informe. Se mueve por test.
let capabilities = { role: "ADMIN", permissions: ["software_delivery"] };
vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve(capabilities),
}));

import SoftwareDelivery from "./SoftwareDelivery";

beforeEach(() => {
  capabilities = { role: "ADMIN", permissions: ["software_delivery"] };
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount(onNavigate = vi.fn()) {
  respond("get", /\/api\/v1\/plugins\/catalog.*/, {
    ok: true,
    catalog: [{ key: "amp", required: true }, { key: "sdp", required: false }],
  });
  respond("get", /\/api\/v1\/policies\/tenants\/.*\/policy.*/, {
    ok: true,
    policy: { policy_version: 3, policy_hash: "abc", policy_json: { plugins: { enabled: ["amp", "sdp"] } } },
  });
  // La pestaña Overview reparte su carga entre varios endpoints (paquetes,
  // despliegues, sitios, DPs, series…), así que se cuentan TODAS las llamadas
  // de datos y no una ruta concreta: lo que se comprueba es que vuelve a
  // pedir, no por dónde.
  const sdpCalls = [];
  server.use(
    http.get(/\/api\/v1\/(software-delivery|sdp|agent).*/, ({ request }) => {
      sdpCalls.push(new URL(request.url).pathname);
      return HttpResponse.json({ ok: true, items: [], buckets: [], stats: null });
    })
  );
  window.history.replaceState({}, "", "/?page=software-delivery");
  render(<SoftwareDelivery onNavigate={onNavigate} />);
  return { sdpCalls };
}

describe("Software Delivery — cabecera", () => {
  it('el botón "Report" lleva a Reports con el informe preseleccionado', async () => {
    const onNavigate = vi.fn();
    mount(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(onNavigate).toHaveBeenCalledWith("reports");
    // La clave existe en el catálogo del backend; no se inventa un tipo "sdp".
    expect(new URL(window.location.href).searchParams.get("reportKey")).toBe("global.fleet-health");
  });

  it("va a la misma altura que el Refresh de al lado", async () => {
    mount();

    const report = await screen.findByRole("button", { name: /^report$/i });
    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    expect(report.className).not.toMatch(/sizeSmall/);
    expect(refresh.className).not.toMatch(/sizeSmall/);
  });

  it("el control de auto-refresco está, como en Asset Management", async () => {
    mount();
    expect(await screen.findByLabelText(/auto refresh/i)).toBeTruthy();
  });

  it("refrescar hace que la pestaña montada vuelva a pedir DE VERDAD", async () => {
    // ⭐ Lo que hace honesto al botón, y lo que casi se queda sin hacer:
    // subir el nonce vuelve a lanzar los efectos, pero `httpGetJson` sirve de
    // su caché en memoria mientras la entrada esté fresca (60 s), así que no
    // salía ni una petición. El control tira la caché antes de recargar; sin
    // eso este test cuenta las mismas 8 llamadas del montaje y ninguna más.
    const { sdpCalls } = mount();

    await waitFor(() => expect(sdpCalls.length).toBeGreaterThan(0));
    const antes = sdpCalls.length;

    await userEvent.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(() => expect(sdpCalls.length).toBeGreaterThan(antes));
  });

  it("a un rol sin ADMIN/OWNER no se le ofrece el informe, pero sí el refresco", async () => {
    // El tipo declara `minRole: ["ADMIN","OWNER"]`. Un rol personalizado que
    // gestiona despliegues (capacidad `software_delivery`) pero no es
    // administrador vería un botón que termina en "no disponible".
    capabilities = { role: "SDP Operator", permissions: ["software_delivery"] };

    mount();

    expect(await screen.findByRole("button", { name: /^refresh$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
  });
});
