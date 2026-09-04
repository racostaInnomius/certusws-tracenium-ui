// src/pages/CryptoDiscovery.kpi.test.jsx
//
// Los KPI de Crypto Discovery LLEVAN a su lista.
//
// Análisis de madurez 2026-09: los seis KPI eran inertes aunque
// `SummaryCard` soporta `onClick` desde siempre y lo usa Overview. Un
// número que no lleva a su lista es un adorno; y «With private key» es
// justo el número que separa lo que el cliente posee de lo que le llega
// con el sistema — el que ordena todo lo demás.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

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
vi.mock("../api/cdp", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getCdpSummary: vi.fn(async () => ({ totalCerts: 143, withPrivateKey: 143, expiring30d: 0, expiredWithKey: 7, withFlags: 12, devicesReporting: 53 })),
    getCdpDashboard: vi.fn(async () => ({})),
    getCdpExposure: vi.fn(async () => ({ exposure: null })),
    getCdpRoadmap: vi.fn(async () => ({ ok: true, systems: [], waves: [], weights: {} })),
    getCdpReadinessHistory: vi.fn(async () => ({ ok: true, snapshots: [] })),
    getCdpFacets: vi.fn(async () => ({ rows: [] })),
    getCdpStores: vi.fn(async () => ({ stores: [] })),
    getCdpTimeline: vi.fn(async () => ({ buckets: [], references: [] })),
    getCdpPqcReadiness: vi.fn(async () => ({})),
    listCdpCertificates: (...a) => listCdpCertificates(...a),
    listCdpDevices: vi.fn(async () => ({ items: [], total: 0 })),
    listCdpTrustAnchors: vi.fn(async () => ({ items: [] })),
    listOrphanKeys: vi.fn(async () => ({ ok: true, items: [], total: 0 }))
  };
});
vi.mock("../api/remoteControl", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, getAccessPolicy: vi.fn(async () => ({ ok: true, cells: [], capabilities: [], classes: [] })) };
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

describe("KPI clicables", () => {
  it("⭐ «With private key» abre Certificates con el filtro puesto, y la lista lo pide", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    const card = await screen.findByText("With private key", {}, { timeout: 4000 });
    card.click();

    // La URL es la fuente de verdad: pestaña 2 y pk=1.
    await waitFor(() => {
      const p = new URLSearchParams(window.location.search);
      expect(p.get("cdpTab")).toBe("3");
      expect(p.get("pk")).toBe("1");
      expect(p.get("page")).toBe("cdp");
    });
    // Y la pestaña lo enseña como control propio, no como chip huérfano.
    const sw = await screen.findByLabelText(/^With private key$/i);
    expect(sw).toBeChecked();
    // Y el backend recibe el filtro.
    await waitFor(() =>
      expect(listCdpCertificates).toHaveBeenCalledWith(expect.objectContaining({ hasPrivateKey: true }))
    );
  });

  it("«Expired, with private key» combina estado y clave", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    (await screen.findByText("Expired, with private key", {}, { timeout: 4000 })).click();
    await waitFor(() =>
      expect(listCdpCertificates).toHaveBeenCalledWith(
        expect.objectContaining({ status: "expired", hasPrivateKey: true })
      )
    );
  });

  it("un KPI REEMPLAZA el filtro anterior: es una vista, no un refinamiento", async () => {
    window.history.replaceState({}, "", "/?page=cdp&q=veeam&flag=weak_sig");
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    (await screen.findByText("Hygiene flags", {}, { timeout: 4000 })).click();
    await waitFor(() => {
      const p = new URLSearchParams(window.location.search);
      expect(p.get("flagged")).toBe("1");
      expect(p.has("q")).toBe(false);
      expect(p.has("flag")).toBe(false);
    });
  });
});
