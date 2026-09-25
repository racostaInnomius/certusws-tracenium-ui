// src/pages/CryptoDiscovery.kpi.test.jsx
//
// Los KPI de Crypto Discovery LLEVAN a su lista.
//
// Análisis de madurez 2026-09: los seis KPI eran inertes aunque
// `SummaryCard` soporta `onClick` desde siempre y lo usa Overview. Un
// número que no lleva a su lista es un adorno; y «you own» es justo el
// número que separa lo que el cliente posee de lo que le llega con el
// sistema — el que ordena todo lo demás.

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
    // Ola 1.6 — riesgo y política criptográfica. Mockeados aunque esta prueba
    // no vaya de eso: la tira del Dashboard y Settings los piden al montar, y
    // una petición sin handler es un fallo de la prueba, no del código.
    getCdpRiskSummary: vi.fn(async () => ({ ok: true, bands: {}, factors: [], weights: {}, bandThresholds: [] })),
    listCdpRiskTop: vi.fn(async () => ({ ok: true, items: [] })),
    getCdpCryptoPolicy: vi.fn(async () => ({ ok: true, rules: {} })),
    getCdpSummary: vi.fn(async () => ({ totalCerts: 143, withPrivateKey: 143, expiring30d: 0, expiredWithKey: 7, withFlags: 12, devicesReporting: 53 })),
    getCdpDashboard: vi.fn(async () => ({})),
    getCdpExposure: vi.fn(async () => ({ exposure: null })),
    getCryptoAssetsSummary: vi.fn(async () => ({ ok: true, sources: [], byType: [], matchedFleetCertificates: 0, imports: [] })),
    listCryptoAssets: vi.fn(async () => ({ ok: true, items: [] })),
    getCdpRoadmap: vi.fn(async () => ({ ok: true, systems: [], waves: [], weights: {} })),
    getCdpReadinessHistory: vi.fn(async () => ({ ok: true, snapshots: [] })),
    getCdpFacets: vi.fn(async () => ({ rows: [] })),
    getCdpStores: vi.fn(async () => ({ stores: [] })),
    getCdpTimeline: vi.fn(async () => ({ buckets: [], references: [] })),
    getCdpPqcReadiness: vi.fn(async () => ({})),
    listCdpCertificates: (...a) => listCdpCertificates(...a),
    listCdpDevices: vi.fn(async () => ({ items: [], total: 0 })),
    listCdpTrustAnchors: vi.fn(async () => ({ items: [] })),
    listOrphanKeys: vi.fn(async () => ({ ok: true, items: [], total: 0 })),
    listCdpConnectors: vi.fn(async () => ({ ok: true, secretsConfigured: true, connectors: [] })),
    listCdpAdcsSources: vi.fn(async () => ({ ok: true, sources: [] })),
    listCdpProbeCandidates: vi.fn(async () => ({ ok: true, candidates: [] }))
  };
});
vi.mock("../api/remoteControl", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, getAccessPolicy: vi.fn(async () => ({ ok: true, cells: [], capabilities: [], classes: [] })) };
});

vi.mock("../api/policies", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getTenantPolicy: vi.fn(async () => ({ ok: true, policy: { policy_version: 1, policy_json: { cdp: {} } } })),
    patchTenantPolicyDomain: vi.fn(async () => ({ ok: true, policyVersion: 2 }))
  };
});
vi.mock("../hooks/useEffectiveTenantId", () => ({ useEffectiveTenantId: () => "1" }));

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
  it("⭐ «you own» abre TODO lo que tiene clave —CA incluidas, como lo cuenta— y la lista lo pide", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    const label = await screen.findByText("Quantum-broken certificates you own", {}, { timeout: 4000 });
    // 24-sep: la tarjeta «With private key» (223) repetía esta cifra (229)
    // con otra definición en la misma pantalla. Se fue.
    expect(screen.queryByText("With private key")).not.toBeInTheDocument();
    label.closest("[role=button]").click();

    // La URL es la fuente de verdad: Inventory, pk=1 y la lente entera.
    await waitFor(() => {
      const p = new URLSearchParams(window.location.search);
      expect(p.get("cdpTab")).toBe("3");
      expect(p.get("pk")).toBe("1");
      expect(p.get("class")).toBe("all");
      expect(p.get("roots")).toBe("1");
      expect(p.get("page")).toBe("cdp");
    });
    // Y la pestaña lo enseña como control propio, no como chip huérfano.
    const sw = await screen.findByLabelText(/^With private key$/i);
    expect(sw).toBeChecked();
    // Y el backend recibe el filtro.
    await waitFor(() =>
      expect(listCdpCertificates).toHaveBeenCalledWith(expect.objectContaining({ hasPrivateKey: true, certClass: "all", includeRoots: true }))
    );
  });

  it("⭐ Atrás desde la lista vuelve al Dashboard, no fuera de la app (24-sep)", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    const before = window.history.length;
    (await screen.findByText("Expired, with key", {}, { timeout: 4000 })).click();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("cdpTab")).toBe("3"));
    // El cambio de pestaña se APILA; un chip dentro de la pestaña no.
    expect(window.history.length).toBe(before + 1);
    window.history.back();
    await waitFor(() => expect(screen.getByRole("tab", { name: /^dashboard$/i })).toHaveAttribute("aria-selected", "true"));
    expect(new URLSearchParams(window.location.search).get("page")).toBe("cdp");
  });

  it("«Expired, with key» combina estado y clave", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    (await screen.findByText("Expired, with key", {}, { timeout: 4000 })).click();
    await waitFor(() =>
      expect(listCdpCertificates).toHaveBeenCalledWith(
        expect.objectContaining({ status: "expired", hasPrivateKey: true })
      )
    );
  });

  it("⭐ las tarjetas de resumen llevan a su pestaña (el Dashboard es un overview)", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    (await screen.findByRole("button", { name: /^Open Trust anchors$/i }, { timeout: 4000 })).click();
    await waitFor(() => expect(screen.getByRole("tab", { name: /^trust anchors$/i })).toHaveAttribute("aria-selected", "true"));
    expect(new URLSearchParams(window.location.search).get("cdpTab")).toBe("4");
    // Sin datos de resumen (dashboard vacío en este mock) la tarjeta no
    // pinta ceros: dice que no hay anclas.
    screen.getByRole("tab", { name: /^dashboard$/i }).click();
    expect(await screen.findByText(/No trust anchors reported yet/i)).toBeInTheDocument();
    // Repaso UX 2026-09-13: el Dashboard es un preview. Ni embudo, ni
    // línea de tiempo, ni lista de equipos: viven en Explore e Inventory.
    expect(screen.queryByText(/Your exposure/)).not.toBeInTheDocument();
    expect(screen.queryByText(/When certificates expire/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Devices needing attention/)).not.toBeInTheDocument();
    expect(screen.getByText(/Post-quantum readiness/)).toBeInTheDocument();
  });

  it("un KPI REEMPLAZA el filtro anterior: es una vista, no un refinamiento", async () => {
    window.history.replaceState({}, "", "/?page=cdp&q=veeam&flag=weak_sig");
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    // 14-sep: el KPI «Hygiene flags» se fue; la tarjeta Hygiene abre la
    // misma lista y sustituye el filtro igual.
    (await screen.findByRole("button", { name: /^Open Hygiene$/i }, { timeout: 4000 })).click();
    await waitFor(() => {
      const p = new URLSearchParams(window.location.search);
      expect(p.get("flagged")).toBe("1");
      expect(p.has("q")).toBe(false);
      expect(p.has("flag")).toBe(false);
    });
  });
});
