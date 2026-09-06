// src/pages/CryptoDiscovery.inventory.test.jsx
//
// Fase 1, pieza D: Certificates y Devices son UNA lista. La propiedad es
// que las dos agrupaciones obedecen el MISMO filtro (el de la URL): con
// `flag=weak_sig`, la vista por equipo pide equipos con weak_sig, y al
// volver a «por certificado» el filtro sigue ahí.

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

const listCdpCertificates = vi.fn(async () => ({ items: [], total: 0 }));
const listCdpDevices = vi.fn(async () => ({
  items: [{ agentId: "a1", host: "srv-01", platform: "windows", certCount: 3, withPrivateKey: 1, expired: 1, expiring: 0, withFlags: 3, lastSeen: "2026-09-04T00:00:00Z" }],
  total: 1
}));

vi.mock("../api/cdp", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getCdpSummary: vi.fn(async () => ({})),
    getCdpDashboard: vi.fn(async () => ({})),
    getCdpFacets: vi.fn(async () => ({ rows: [] })),
    listCdpCertificates: (...a) => listCdpCertificates(...a),
    listCdpDevices: (...a) => listCdpDevices(...a),
    listCdpDeviceCertificates: vi.fn(async () => ({ items: [] })),
    listCdpTrustAnchors: vi.fn(async () => ({ items: [] })),
    listOrphanKeys: vi.fn(async () => ({ ok: true, items: [], total: 0 })),
    listCdpConnectors: vi.fn(async () => ({ ok: true, secretsConfigured: true, connectors: [] }))
  };
});

import CryptoDiscovery from "./CryptoDiscovery";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

beforeEach(() => {
  window.history.replaceState({}, "", "/?page=cdp&cdpTab=3&flag=weak_sig&view=devices");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("Inventory: una lista, dos agrupaciones", () => {
  it("⭐ la vista por equipo pide equipos con el MISMO filtro de la URL", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    await waitFor(() => expect(listCdpDevices).toHaveBeenCalled(), { timeout: 4000 });
    expect(listCdpDevices.mock.calls[0][0]).toEqual(expect.objectContaining({ flag: "weak_sig", page: 1 }));
    expect(listCdpCertificates).not.toHaveBeenCalled();
    // Columnas de equipo, y el contador es «Matching» (sobre el filtro),
    // no «Certs» (todo el equipo).
    await screen.findByText("srv-01");
    expect(screen.getByText("Matching")).toBeInTheDocument();
    // El export es de certificados: en la vista por equipo no se ofrece.
    expect(screen.queryByRole("button", { name: /export csv/i })).not.toBeInTheDocument();
  });

  it("⭐ cambiar a «por certificado» conserva el filtro y pide certificados", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    await waitFor(() => expect(listCdpDevices).toHaveBeenCalled(), { timeout: 4000 });
    fireEvent.click(await screen.findByRole("button", { name: /by certificate/i }));
    await waitFor(() => expect(listCdpCertificates).toHaveBeenCalled());
    expect(listCdpCertificates.mock.calls[0][0]).toEqual(expect.objectContaining({ flag: "weak_sig" }));
    expect(new URLSearchParams(window.location.search).has("view")).toBe(false);
    expect(new URLSearchParams(window.location.search).get("flag")).toBe("weak_sig");
    await screen.findByRole("button", { name: /export csv/i });
  });

  it("no hay pestaña «Devices»: la agrupación vive dentro de Inventory", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    await screen.findByRole("tab", { name: /inventory/i }, { timeout: 4000 });
    expect(screen.queryByRole("tab", { name: /^devices$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^certificates$/i })).not.toBeInTheDocument();
  });
});
