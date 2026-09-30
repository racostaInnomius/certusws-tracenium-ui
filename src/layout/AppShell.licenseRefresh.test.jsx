// src/layout/AppShell.licenseRefresh.test.jsx
//
// Pagar en Billing tiene que levantar el bloqueo de consola SIN recargar.
//
// El estado de licencia sólo se releía al cambiar de tenant: el cliente con la
// prueba vencida contrataba en Billing —la única página que el bloqueo deja
// pasar— y al salir seguía viendo la pantalla de bloqueo.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

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
  // Un botón que salta a Reports como lo hace «Report»: escribe su parámetro y
  // llama a onNavigate.
  renderPage: (page, { onNavigate }) => (
    <div>
      <div data-testid="pagina">{page}</div>
      <button
        onClick={() => {
          const url = new URL(window.location.href);
          url.searchParams.set("reportKey", "pmp.operations");
          window.history.replaceState({}, "", url);
          onNavigate("reports");
        }}
      >
        to-reports
      </button>
    </div>
  ),
  PAGES: [],
}));
let licenseState = null;
const getLicenseState = vi.fn(async () => licenseState);
vi.mock("../api/licensing", () => ({
  getLicenseState: (...a) => getLicenseState(...a),
}));

import AppShell from "./AppShell";
import { notifyLicenseStateChanged } from "../utils/licenseEvents";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

const BLOCKED = {
  consoleBlocked: true,
  blockReason: "trial_expired",
  trialEndedAt: "2026-09-01T00:00:00Z",
  exempt: false,
  used: 3,
  maxDevices: 50,
  status: "NORMAL",
  adjustment: null,
  payment: null,
};

describe("AppShell — el bloqueo se levanta al pagar", () => {
  it("⭐ el aviso de Billing relee el estado y quita la pantalla de bloqueo", async () => {
    licenseState = BLOCKED;
    window.history.replaceState({}, "", "/?page=overview");
    render(<AppShell />);

    await waitFor(() => expect(screen.getByText("Go to Billing")).toBeTruthy());
    expect(screen.queryByTestId("pagina")).toBeNull();

    licenseState = { ...BLOCKED, consoleBlocked: false, blockReason: null };
    act(() => notifyLicenseStateChanged());

    await waitFor(() => expect(screen.getByTestId("pagina").textContent).toBe("overview"));
  });
});
