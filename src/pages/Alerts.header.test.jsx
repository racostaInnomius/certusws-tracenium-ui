// src/pages/Alerts.header.test.jsx
//
// La cabecera de Alerts: el botón "Report" y que el refresco funcione.
//
// El informe es el rastro de AUDITORÍA, no un tipo "alerts" inventado: las
// alertas se derivan de los eventos de auditoría, así que ése es el material
// del que salen. Sólo existe en CSV — es un volcado para analizar fuera.
//
// El refresco de esta página son dos fuentes (el feed y las reglas) y ambas
// pasan por `useCachedFetch`; lo que se comprueba es que pulsar el botón sale
// a la red, que con la caché de 60 s de `httpGetJson` no es gratis.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { clearCachedFetch } from "../hooks/useCachedFetch";

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

import Alerts from "./Alerts";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
});

function mount(onNavigate = vi.fn()) {
  const calls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (request.method === "GET") calls.push(url.pathname);
      return HttpResponse.json({
        ok: true, items: [], events: [], rules: [], templates: [],
        summary: {}, total: 0, lastSeenAt: null,
      });
    })
  );
  window.history.replaceState({}, "", "/?page=alerts");
  render(<Alerts onNavigate={onNavigate} />);
  return calls;
}

describe("Alerts — cabecera", () => {
  it('el botón "Report" lleva al rastro de auditoría, en CSV', async () => {
    const onNavigate = vi.fn();
    mount(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(onNavigate).toHaveBeenCalledWith("reports");
    const params = new URL(window.location.href).searchParams;
    // Las alertas se derivan de los eventos de auditoría: el informe que da el
    // material del que salen es ése, y no un tipo "alerts" que no existe.
    expect(params.get("reportKey")).toBe("audit.events");
    // `audit.events` sólo tiene formato CSV en el registro.
    expect(params.get("reportFormat")).toBe("csv");
  });

  it("va a la misma altura que los otros dos botones de la fila", async () => {
    mount();
    const rules = await screen.findByRole("button", { name: /manage rules/i });
    const report = screen.getByRole("button", { name: /^report$/i });
    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    for (const b of [rules, report, refresh]) {
      expect(b.className).not.toMatch(/sizeSmall/);
    }
  });
});

describe("Alerts — el refresco sale a la red", () => {
  it("pulsar Refresh vuelve a pedir el feed y las reglas", async () => {
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
