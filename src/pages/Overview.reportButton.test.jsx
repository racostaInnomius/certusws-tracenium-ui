// src/pages/Overview.reportButton.test.jsx
//
// El botón "Report" de Overview no genera nada: manda a Reports con el
// informe ya elegido, y allí se confirma y se genera POR EL MOTOR.
//
// Antes abría aquí mismo un diálogo que descargaba por `/api/v1/fleet-report`.
// El fichero salía igual, pero no quedaba constancia: `report_runs` es el
// ledger que contesta "¿quién se llevó qué y cuándo?" y del que cuelgan la
// re-entrega y el SHA-256 del artefacto. Un export que lo esquiva es una copia
// sin trazabilidad circulando por ahí.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const MOCK_AUTH = {
  tenantId: "t-1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "t-1" },
  email: "op@tracenium.test",
};
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false, refreshAuth: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));

import Overview from "./Overview";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function renderOverview(onNavigate) {
  // Un solo manejador para todo el abanico de peticiones que Overview
  // dispara; con colecciones vacías cada tarjeta se queda en su rama de
  // "sin datos" en vez de reventar en un `.map`.
  server.use(
    http.all(/.*\/api\/.*/, () =>
      HttpResponse.json({ ok: true, items: [], devices: [], hosts: [], summary: {}, total: 0 })
    )
  );
  window.history.replaceState({}, "", "/?page=overview");
  render(<ConfirmProvider><Overview onNavigate={onNavigate} /></ConfirmProvider>);
}

describe('Overview — el botón "Report"', () => {
  it("lleva a Reports con el informe de flota preseleccionado", async () => {
    const onNavigate = vi.fn();
    renderOverview(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(onNavigate).toHaveBeenCalledWith("reports");
    const params = new URL(window.location.href).searchParams;
    // La clave es la del catálogo del backend (`REPORT_REGISTRY`), no un
    // nombre inventado aquí: si no casa, Reports avisa de que ese informe no
    // está disponible en vez de generarlo.
    expect(params.get("reportKey")).toBe("global.fleet-health");
    expect(params.get("reportFormat")).toBe("pdf");
  });

  it("no genera ni descarga nada desde esta página", async () => {
    // Lo que se fue: el diálogo con sus botones de CSV/PDF, que llamaban a
    // `/api/v1/fleet-report` y no dejaban fila en el ledger.
    const llamadas = [];
    server.use(
      http.all(/.*\/api\/.*/, ({ request }) => {
        llamadas.push(new URL(request.url).pathname);
        return HttpResponse.json({ ok: true, items: [], devices: [], hosts: [], summary: {} });
      })
    );
    window.history.replaceState({}, "", "/?page=overview");
    render(<ConfirmProvider><Overview onNavigate={vi.fn()} /></ConfirmProvider>);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(llamadas.some((p) => p.includes("/fleet-report"))).toBe(false);
  });

  it("a quien no es ADMIN/OWNER no se le ofrece", async () => {
    // El backend exige ADMIN/OWNER para este tipo (`minRole` en el registro),
    // así que enseñar el botón sería ofrecer una puerta que devuelve 403.
    MOCK_AUTH.tenantMember.role = "USER";
    try {
      renderOverview(vi.fn());
      await screen.findByText("Overview");
      expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
    } finally {
      MOCK_AUTH.tenantMember.role = "ADMIN";
    }
  });
});
