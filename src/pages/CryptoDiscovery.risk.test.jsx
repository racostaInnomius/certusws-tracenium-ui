// src/pages/CryptoDiscovery.risk.test.jsx
//
// Ola 1.6 en la página montada de verdad: la tira de riesgo del Dashboard
// lleva a la pestaña Risk con la banda puesta, y la lista la pide.
//
// Se monta la página entera y no sólo la tira porque lo que se fija es el
// CABLEADO (índice de pestaña, clave de URL, prop que llega al panel): cada
// pieza por separado puede estar bien y el clic no llevar a ninguna parte.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

const listCdpRiskTop = vi.fn(async () => ({ ok: true, items: [] }));
vi.mock("../api/cdp", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getCdpSummary: vi.fn(async () => ({ summary: { totalCerts: 10 } })),
    getCdpDashboard: vi.fn(async () => ({})),
    getCdpExposure: vi.fn(async () => ({ exposure: null })),
    getCdpPqcReadiness: vi.fn(async () => ({})),
    getCdpRiskSummary: vi.fn(async () => ({
      ok: true,
      bands: { critical: 2, high: 5, medium: 0, low: 1, none: 30, unscored: 0 },
      factors: [],
      weights: { revoked: 40 },
      bandThresholds: [{ band: "critical", min: 70 }, { band: "none", min: 0 }]
    })),
    listCdpRiskTop: (...a) => listCdpRiskTop(...a)
  };
});

import CryptoDiscovery from "./CryptoDiscovery";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

beforeEach(() => {
  window.history.replaceState({}, "", "/?page=cdp");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("riesgo en Crypto Discovery", () => {
  it("⭐ una banda de la tira abre la pestaña Risk con esa banda, y la lista la pide", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );

    fireEvent.click(await screen.findByRole("button", { name: "High: 5 certificates" }, { timeout: 4000 }));

    await waitFor(() => expect(screen.getByRole("tab", { name: /^risk$/i })).toHaveAttribute("aria-selected", "true"));
    const p = new URLSearchParams(window.location.search);
    expect(p.get("cdpTab")).toBe("7");
    expect(p.get("rband")).toBe("high");
    await waitFor(() => expect(listCdpRiskTop).toHaveBeenCalledWith(expect.objectContaining({ minBand: "high" })));
  });

  it("«Open risk list» abre la pestaña SIN banda, aunque quedara una de antes", async () => {
    window.history.replaceState({}, "", "/?page=cdp&rband=critical");
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );

    fireEvent.click(await screen.findByRole("button", { name: /open risk list/i }, { timeout: 4000 }));

    await waitFor(() => expect(new URLSearchParams(window.location.search).get("cdpTab")).toBe("7"));
    expect(new URLSearchParams(window.location.search).get("rband")).toBeNull();
    await waitFor(() => expect(listCdpRiskTop).toHaveBeenCalledWith(expect.objectContaining({ minBand: undefined })));
  });

  it("la pestaña Risk va detrás de Inventory en la barra", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    const names = (await screen.findAllByRole("tab", {}, { timeout: 4000 })).map((t) => t.textContent);
    expect(names.indexOf("Risk")).toBe(names.indexOf("Inventory") + 1);
  });
});
