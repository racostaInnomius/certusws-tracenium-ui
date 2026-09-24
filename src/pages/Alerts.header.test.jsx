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

function mount(opts = {}) {
  const onNavigate = typeof opts === "function" ? opts : (opts.onNavigate ?? vi.fn());
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
  if (!opts.keepUrl) window.history.replaceState({}, "", "/?page=alerts");
  render(<Alerts onNavigate={onNavigate} />);
  return calls;
}

describe("Alerts — cabecera", () => {
  it('el botón "Report" lleva a SU informe, no al rastro de auditoría', async () => {
    const onNavigate = vi.fn();
    mount(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(onNavigate).toHaveBeenCalledWith("reports");
    const params = new URL(window.location.href).searchParams;
    // `alerts.activity` (backend, plan de cobertura N5). El rastro de auditoría
    // contestaba otra pregunta.
    expect(params.get("reportKey")).toBe("alerts.activity");
    expect(params.get("reportFormat")).toBe("pdf");
  });

  it("Report y Refresh van a la misma altura", async () => {
    mount();
    const report = await screen.findByRole("button", { name: /^report$/i });
    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    for (const b of [report, refresh]) {
      expect(b.className).not.toMatch(/sizeSmall/);
    }
  });

  it("⭐ la configuración son pestañas, como en las otras páginas — ya no botones que abren drawers", async () => {
    mount();
    expect(await screen.findByRole("tab", { name: /^alerts$/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /^rules$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /manage rules/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^destinations$/i })).not.toBeInTheDocument();
  });

  it("⭐ las pestañas van ENCIMA de las tarjetas: primero se elige la sección", async () => {
    mount();
    const tabs = (await screen.findByRole("tab", { name: /^alerts$/i })).closest("[role=tablist]");
    const card = screen.getByText("Active rules");
    // compareDocumentPosition: FOLLOWING (4) = la tarjeta va después.
    expect(tabs.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("la pestaña va en la URL (?alertsTab=) y se puede enlazar", async () => {
    window.history.replaceState({}, "", "/?page=alerts&alertsTab=rules");
    const calls = mount({ keepUrl: true });
    expect(await screen.findByRole("tab", { name: /^rules$/i })).toHaveAttribute("aria-selected", "true");
    void calls;
    await userEvent.click(screen.getByRole("tab", { name: /^alerts$/i }));
    // La pestaña por defecto no ensucia la URL.
    expect(new URL(window.location.href).searchParams.get("alertsTab")).toBeNull();
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
