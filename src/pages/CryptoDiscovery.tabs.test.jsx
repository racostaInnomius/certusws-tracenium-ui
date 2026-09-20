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

vi.mock("../api/cdp", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getCdpSummary: vi.fn(async () => ({})),
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
    listCdpCertificates: vi.fn(async () => ({ items: [], total: 0 })),
    listCdpDevices: vi.fn(async () => ({ items: [], total: 0 })),
    listCdpTrustAnchors: vi.fn(async () => ({ items: [] })),
    listOrphanKeys: vi.fn(async () => ({ ok: true, items: [], total: 0 })),
    listCdpConnectors: vi.fn(async () => ({ ok: true, secretsConfigured: true, connectors: [] })),
    listCdpAdcsSources: vi.fn(async () => ({ ok: true, sources: [] })),
    listCdpVcenterSources: vi.fn(async () => ({ ok: true, sources: [] })),
    listCdpProbeCandidates: vi.fn(async () => ({ ok: true, candidates: [] })),
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

vi.mock("../api/policies", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getTenantPolicy: vi.fn(async () => ({ ok: true, policy: { policy_version: 1, policy_json: { cdp: {} } } })),
    patchTenantPolicyDomain: vi.fn(async () => ({ ok: true, policyVersion: 2 }))
  };
});
vi.mock("../hooks/useEffectiveTenantId", () => ({ useEffectiveTenantId: () => "1" }));
// ADR-0026 — los derechos del tenant. Por defecto, CON el complemento: lo que
// cambia sin él tiene su propio caso más abajo.
const isEntitled = vi.fn(() => true);
vi.mock("../hooks/usePluginCatalog", () => ({ usePluginCatalog: () => ({ catalog: [], entitled: null, isEntitled: (k) => isEntitled(k) }) }));
// El gateway de vCenter compartido (Settings → Infra) y las capacidades del que mira.
vi.mock("../api/infrastructure", () => ({
  listGateways: vi.fn(async () => ({ gateways: [] })),
  createGateway: vi.fn(),
  updateGateway: vi.fn(),
  deleteGateway: vi.fn(),
  verifyGateway: vi.fn(),
  getGatewayPublicKey: vi.fn(),
  provisionGatewayCredential: vi.fn()
}));
vi.mock("../api/roles", () => ({ getMyCapabilities: vi.fn(async () => ({ ok: true, role: "ADMIN", permissions: ["crypto_discovery"] })) }));

import CryptoDiscovery from "./CryptoDiscovery";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("pestañas de Crypto Discovery", () => {
  it("⭐ «Settings» pinta lo suyo, y «Orphan keys» NO lo pinta; la matriz de vistobueno ya no está aquí", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );

    const huerfanas = await screen.findByRole("tab", { name: /orphan keys/i }, { timeout: 4000 });
    huerfanas.click();
    // El texto de honestidad del panel de huérfanas: prueba de que ESTÁ.
    await screen.findByText(/without that meaning there are none/i);
    // Y lo de Settings NO: este era el síntoma —dos paneles apilados bajo
    // una sola pestaña.
    expect(screen.queryByText(/Remote TLS probes/i)).not.toBeInTheDocument();

    const policy = screen.getByRole("tab", { name: /^settings$/i });
    policy.click();
    // Este era el otro síntoma: la pestaña en blanco.
    await screen.findByText(/Remote TLS probes/i);
    expect(screen.queryByText(/without that meaning/i)).not.toBeInTheDocument();
    // La matriz de vistobueno se movió a Agent Settings (08-sep): es un
    // cambio de permisos y no puede estar en la página del plugin.
    expect(screen.queryByText(/Privileged access policy/i)).not.toBeInTheDocument();
  });

  it("⭐ ADR-0026 · sin «CDP Coverage» se EXPLICA lo que falta y se congela lo que ya había — nunca se esconde", async () => {
    isEntitled.mockImplementation((k) => k !== "cdp_coverage");
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    (await screen.findByRole("tab", { name: /^settings$/i }, { timeout: 4000 })).click();
    screen.getByRole("button", { name: /^Expand Infra$/ }).click();
    // Explica, con el nombre del complemento y qué pasa con lo ya recogido.
    const notices = await screen.findAllByText(/Included in CDP Coverage/);
    expect(notices.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/stays visible with the date it was last read/)[0]).toBeInTheDocument();
    // Y el alta de conectores de pago no se ofrece (el servidor contestaría 402).
    expect(screen.queryByText("Kubernetes clusters")).toBeInTheDocument();
    expect(screen.queryByLabelText(/API server/i)).toBeNull();
    // Los dominios públicos siguen siendo del paquete, con su contador.
    screen.getByRole("button", { name: /^Expand Cloud$/ }).click();
    expect(await screen.findByText(/of 3 included in your package/)).toBeInTheDocument();
    isEntitled.mockImplementation(() => true);
  });

  it("⭐ Settings concentra lo configurable, ordenado por los sectores del sunburst; Explore solo mira", async () => {
    render(
      <ConfirmProvider>
        <CryptoDiscovery />
      </ConfirmProvider>
    );
    const settings = await screen.findByRole("tab", { name: /^settings$/i }, { timeout: 4000 });
    settings.click();
    // Una sección plegable por sector, con las fichas de estado en la
    // cabecera (no hay mapa aparte: era información duplicada). Windows
    // CA cuelga de Infra (19-sep: On-prem es sólo lo de los agentes).
    for (const base of ["On-prem devices", "Infra", "Cloud", "External key sources"]) expect(await screen.findByRole("heading", { name: base })).toBeInTheDocument();
    // Windows CA es PARTE de Infra: su ficha va en la cabecera de Infra
    // con «CA ·» delante y su bloque dentro de esa tarjeta.
    expect(screen.getByRole("button", { name: /^CA · AD CS reader: not connected$/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^Azure Key Vault: not connected$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^vCenter: not connected$/ })).toBeInTheDocument();
    // Plegadas sin nada fallando; un clic en la cabecera (o en una ficha) abre.
    expect(screen.getByRole("button", { name: /^Expand Infra$/ })).toHaveAttribute("aria-expanded", "false");
    screen.getByRole("button", { name: /^vCenter: not connected$/ }).click();
    expect(await screen.findByRole("button", { name: /^Collapse Infra$/ })).toBeInTheDocument();
    screen.getByRole("button", { name: /^Expand On-prem devices$/ }).click();
    screen.getByRole("button", { name: /^Expand Cloud$/ }).click();
    // Abierta Infra, la CA está dentro como bloque propio (h4), no como tarjeta.
    expect(await screen.findByRole("heading", { level: 4, name: "Windows CA" })).toBeInTheDocument();
    // El gateway de vCenter se registra desde aquí, sin pasar por Patch Management.
    expect(await screen.findByText("vCenter gateway")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /register gateway/i })).toBeInTheDocument();
    // Cada tipo de conector en su sector, y CT por su bloque de dominios.
    expect(screen.getByText("Kubernetes clusters")).toBeInTheDocument();
    expect(screen.getByText("AWS Certificate Manager and Google Cloud")).toBeInTheDocument();
    expect(screen.getByText("Azure Key Vault and HashiCorp Vault")).toBeInTheDocument();
    expect(screen.getByText("Import a CBOM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Policies/i })).toHaveAttribute("href", "?page=policies");
    expect(screen.getByText("Public domains")).toBeInTheDocument();
    expect(screen.getByLabelText(/add a domain/i)).toBeInTheDocument();

    // Explore enseña lo que trajeron y remite a Settings; no repite el alta.
    screen.getByRole("tab", { name: /^explore$/i }).click();
    await screen.findByRole("button", { name: /Manage sources/i });
    expect(screen.queryByText("Import a CBOM")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add azure key vault/i })).not.toBeInTheDocument();
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
