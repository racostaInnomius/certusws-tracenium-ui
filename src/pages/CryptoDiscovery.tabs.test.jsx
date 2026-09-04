// src/pages/CryptoDiscovery.tabs.test.jsx
//
// Cada pestaña de Crypto Discovery pinta EXACTAMENTE su panel.
//
// ⚠️ EL FALLO QUE ESTO CAZA LLEGÓ A PRODUCCIÓN. Al añadir la pestaña
// «Claves huérfanas» (ADR-0011 9.d) se le dio el índice 5 sin mover el
// panel de «Access policy», que ya ocupaba el 5. Dos <TabPanel> con el
// mismo índice hacen dos cosas malas a la vez: la pestaña de huérfanas
// pintaba ADEMÁS la matriz de aprobación, y «Access policy» —índice 6
// en la barra— quedaba en blanco. `npm run build` pasó, la suite pasó,
// y el error lo encontró un inventario de la UI, no un test.
//
// Por eso esto monta la página de verdad y recorre TODAS las pestañas:
// la propiedad es «una pestaña, un panel», y no hay forma de comprobarla
// desde fuera del render.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

const MOCK_AUTH = {
  tenantId: "1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
  email: "op@tracenium.test",
  bootstrap: { tenantId: "1" }
};
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false, refreshAuth: vi.fn() }),
  AuthProvider: ({ children }) => children
}));

vi.mock("../api/cdp", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getCdpSummary: vi.fn(async () => ({})),
    getCdpDashboard: vi.fn(async () => ({})),
    getCdpPqcReadiness: vi.fn(async () => ({})),
    listCdpCertificates: vi.fn(async () => ({ items: [], total: 0 })),
    listCdpDevices: vi.fn(async () => ({ items: [], total: 0 })),
    listCdpTrustAnchors: vi.fn(async () => ({ items: [] })),
    listOrphanKeys: vi.fn(async () => ({ ok: true, items: [], total: 0 })),
    distrustAnchor: vi.fn(),
    destroyEndpointKey: vi.fn()
  };
});

vi.mock("../api/remoteControl", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getAccessPolicy: vi.fn(async () => ({ ok: true, cells: [], capabilities: [], classes: [] })),
    setAccessPolicyCell: vi.fn()
  };
});

import CryptoDiscovery from "./CryptoDiscovery";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("pestañas de Crypto Discovery", () => {
  it("⭐ «Access policy» pinta la matriz, y «Claves huérfanas» NO la pinta", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );

    const huerfanas = await screen.findByRole("tab", { name: /claves huérfanas/i }, { timeout: 4000 });
    huerfanas.click();
    // El texto de honestidad del panel de huérfanas: prueba de que ESTÁ.
    await screen.findByText(/sin que eso signifique que no hay ninguna/i);
    // Y la matriz de aprobación NO: este era el síntoma —dos paneles
    // apilados bajo una sola pestaña.
    expect(screen.queryByText(/Privileged access policy/i)).not.toBeInTheDocument();

    const policy = screen.getByRole("tab", { name: /access policy/i });
    policy.click();
    // Este era el otro síntoma: la pestaña en blanco.
    await screen.findByText(/Privileged access policy/i);
    expect(screen.queryByText(/sin que eso signifique/i)).not.toBeInTheDocument();
  });

  it("cada Tab de la barra tiene un panel, y ningún índice se repite", async () => {
    // Se comprueba por construcción y no solo por síntoma: si mañana
    // alguien añade una octava pestaña y repite el índice, el primer
    // test podría seguir verde según qué panel se repita.
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    const tabs = await screen.findAllByRole("tab", {}, { timeout: 4000 });
    expect(tabs.length).toBeGreaterThanOrEqual(7);

    for (const tab of tabs) {
      tab.click();
      await waitFor(() => expect(tab).toHaveAttribute("aria-selected", "true"));
      // MUI TabPanel: el contenedor visible es el único con role=tabpanel
      // y sin `hidden`. Con un índice duplicado habría dos.
      const visibles = screen.queryAllByRole("tabpanel").filter((p) => !p.hidden);
      expect(visibles.length, `pestaña «${tab.textContent}» tiene ${visibles.length} paneles`).toBe(1);
    }
  });
});
