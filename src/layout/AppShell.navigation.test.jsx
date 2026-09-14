// src/layout/AppShell.navigation.test.jsx
//
// Cambiar de página desde el menú abre la página LIMPIA.
//
// El menú sólo cambiaba `page` y dejaba el resto de la URL: salir de Jobs con
// `status=failed` y abrir Security Compliance le pasaba ese `status` (allí es
// otro filtro con el mismo nombre), y volver a Assets reaplicaba un
// `versionBucket` ya olvidado.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
// Un menú mínimo que llama al MISMO onSelect que el real.
vi.mock("./Sidebar", () => ({
  default: ({ onSelect }) => (
    <div>
      <button onClick={() => onSelect("ad")}>go-ad</button>
      <button onClick={() => onSelect("jobs")}>go-jobs</button>
    </div>
  ),
}));
vi.mock("./Topbar", () => ({
  default: () => <div data-testid="topbar" />,
  TOPBAR_HEIGHT: 56,
  CHROME_LINE_WIDTH: 3,
}));
vi.mock("./pageRegistry", () => ({
  renderPage: (page) => <div data-testid="pagina">{page}</div>,
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

describe("AppShell — navegar desde el menú", () => {
  it("⭐ otra página: se van los filtros de la anterior, se quedan las preferencias de auto-refresco", async () => {
    window.history.replaceState({}, "", "/?page=jobs&status=failed,timeout&since=7d&jobsAutoRefresh=60");
    render(<AppShell />);
    await waitFor(() => expect(screen.getByTestId("pagina").textContent).toBe("jobs"));

    fireEvent.click(screen.getByText("go-ad"));

    await waitFor(() => expect(screen.getByTestId("pagina").textContent).toBe("ad"));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("page")).toBe("ad");
    expect(params.has("status")).toBe(false);
    expect(params.has("since")).toBe(false);
    expect(params.get("jobsAutoRefresh")).toBe("60");
  });

  it("la misma página no toca la URL (su filtro sigue delante)", async () => {
    window.history.replaceState({}, "", "/?page=jobs&status=failed");
    render(<AppShell />);
    await waitFor(() => expect(screen.getByTestId("pagina").textContent).toBe("jobs"));

    fireEvent.click(screen.getByText("go-jobs"));

    expect(new URLSearchParams(window.location.search).get("status")).toBe("failed");
  });
});
