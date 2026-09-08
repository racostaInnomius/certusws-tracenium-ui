// src/layout/AppShell.scroll.test.jsx
//
// El contenedor de scroll de la página no puede reservar hueco para su barra.
//
// `overflow-y: auto` pinta la barra sólo cuando hace falta, y esa barra OCUPA
// ancho (15 px medidos en Chromium). Como TODAS las pestañas de una página se
// pintan dentro de este mismo contenedor, pasar de una pestaña larga a una
// corta devolvía esos 15 px y las tarjetas cambiaban de tamaño al navegar.
//
// Se afirman las dos mitades a la vez y a propósito: que la barra no se pinta
// Y que el contenedor SIGUE siendo el que scrollea. Comprobar sólo lo primero
// pasaría también si alguien resolviera el salto quitando el scroll, que es
// otra cosa y peor.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: {
      tenantId: "1",
      email: "op@tracenium.test",
      tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
      bootstrap: { tenantId: "1" },
    },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMsp: () => ({ inPortfolioMode: false, activeClient: null, isMsp: false }),
}));
vi.mock("../msp/TenantSwitcher", () => ({ default: () => null }));
vi.mock("../msp/HierarchyBreadcrumb", () => ({ default: () => null }));
vi.mock("./Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock("./Topbar", () => ({
  default: () => <div data-testid="topbar" />,
  TOPBAR_HEIGHT: 56,
  CHROME_LINE_WIDTH: 3,
}));
// Toda la superficie de páginas detrás de una sola pantalla: este test es
// sobre el CONTENEDOR, no sobre lo que se pinte dentro.
vi.mock("./pageRegistry", () => ({
  renderPage: () => <div data-testid="pagina">contenido</div>,
  PAGES: [],
}));
vi.mock("../api/licensing", () => ({
  getLicenseState: vi.fn(async () => ({ ok: true, state: "active" })),
}));

import AppShell from "./AppShell";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("AppShell — el contenedor de scroll de la página", () => {
  it("scrollea en vertical pero no pinta barra, para que la maquetación no se mueva", async () => {
    render(<AppShell />);
    await waitFor(() => expect(screen.getByTestId("pagina")).toBeInTheDocument());

    const contenedor = document.querySelector("[data-scroll-root]");
    expect(contenedor).toBeTruthy();

    const cs = getComputedStyle(contenedor);
    // Sigue siendo el que scrollea.
    expect(cs.overflowY).toBe("auto");
    // Y no reserva hueco para la barra.
    expect(cs.getPropertyValue("scrollbar-width")).toBe("none");

    // La regla de WebKit/Blink no la resuelve `getComputedStyle` (es un
    // pseudo-elemento), así que se comprueba en el CSS que emotion inyecta.
    // Sin ella, Chromium y Safari siguen pintando la barra.
    //
    // Atada a la clase de ESTE contenedor: buscar la regla suelta en la hoja
    // pasaría con la barra de cualquier otro elemento oculta.
    const clase = [...contenedor.classList].find((c) => c.startsWith("css-"));
    expect(clase).toBeTruthy();
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("");
    expect(css).toContain(`.${clase}::-webkit-scrollbar{display:none;}`);
  });
});
