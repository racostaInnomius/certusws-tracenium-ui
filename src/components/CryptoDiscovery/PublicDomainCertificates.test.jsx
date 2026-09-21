// src/components/CryptoDiscovery/PublicDomainCertificates.test.jsx
//
// El cliente que sólo vigila dominios públicos tiene que poder ver SUS
// certificados sin rebuscar en la tabla genérica de fuera (21-sep): por
// dominio, con caducidad y emisor, y con los que ningún equipo tiene a la
// vista. Se llega desde Settings, desde un chip de Outside o desde el gajo.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const getCryptoAssetsSummary = vi.fn();
const listCryptoAssets = vi.fn();
const listCdpConnectorRuns = vi.fn(async () => ({ runs: [] }));
vi.mock("../../api/cdp", () => ({
  getCryptoAssetsSummary: (...a) => getCryptoAssetsSummary(...a),
  listCryptoAssets: (...a) => listCryptoAssets(...a),
  importCdpCbom: vi.fn(),
  listCdpConnectors: vi.fn(async () => ({ ok: true, connectors: [] })),
  listCdpConnectorRuns: (...a) => listCdpConnectorRuns(...a),
  createCdpConnector: vi.fn(),
  updateCdpConnector: vi.fn(),
  deleteCdpConnector: vi.fn(),
  runCdpConnector: vi.fn()
}));

import PublicDomainCertificates, { publicDomainView } from "./PublicDomainCertificates";
import CbomAssetsPanel from "./CbomAssetsPanel";
import CdpPublicDomains from "./CdpPublicDomains";

const NOW = Date.parse("2026-09-21T12:00:00Z");
const cert = (over) => ({ assetType: "certificate", sourceName: "ct:tracenium.com+2", inFleet: false, names: [], ...over });
const ITEMS = [
  cert({ assetId: "late", name: "tracenium.com", domain: "tracenium.com", names: ["tracenium.com", "www.tracenium.com"], issuerShort: "Let's Encrypt", notAfter: "2026-12-20T00:00:00Z" }),
  cert({ assetId: "soon", name: "mail.tns.com.mx", domain: "tns.com.mx", issuerShort: "Sectigo", notAfter: "2026-10-05T00:00:00Z", inFleet: true, fingerprint256: "f".repeat(64) }),
  cert({ assetId: "api", name: "api.tracenium.com", domain: "tracenium.com", issuerShort: "Google Trust Services", notAfter: "2026-10-15T00:00:00Z" })
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("publicDomainView", () => {
  it("lo que vence primero, arriba; y el resumen es del dominio elegido", () => {
    const all = publicDomainView(ITEMS, { now: NOW });
    expect(all.rows.map((r) => r.assetId)).toEqual(["soon", "api", "late"]);
    expect(all.domains).toEqual(["tns.com.mx", "tracenium.com"]);
    expect(all).toEqual(expect.objectContaining({ total: 3, expiring: 2, notOnDevices: 2 }));

    const one = publicDomainView(ITEMS, { domain: "tracenium.com", now: NOW });
    expect(one.rows.map((r) => r.assetId)).toEqual(["api", "late"]);
    expect(one).toEqual(expect.objectContaining({ total: 2, expiring: 1, notOnDevices: 2 }));
    // Los chips siguen ofreciendo todos los dominios.
    expect(one.domains).toHaveLength(2);
  });

  it("busca también en los nombres alternativos, y los filtros se suman", () => {
    expect(publicDomainView(ITEMS, { query: "www.", now: NOW }).rows.map((r) => r.assetId)).toEqual(["late"]);
    expect(publicDomainView(ITEMS, { expiringOnly: true, notOnDevicesOnly: true, now: NOW }).rows.map((r) => r.assetId)).toEqual(["api"]);
  });
});

describe("PublicDomainCertificates", () => {
  it("⭐ pinta dominio, emisor y caducidad; elegir un dominio lo pide a quien lleva la URL", async () => {
    listCryptoAssets.mockResolvedValue({ items: ITEMS });
    const onDomainChange = vi.fn();
    render(<PublicDomainCertificates refreshNonce={0} onDomainChange={onDomainChange} now={NOW} />);
    const row = (await screen.findByText("mail.tns.com.mx")).closest("tr");
    expect(within(row).getByText("Sectigo")).toBeInTheDocument();
    expect(within(row).getByText("in 13 days")).toBeInTheDocument();
    expect(within(row).getByText("seen by an agent")).toBeInTheDocument();
    expect(screen.getByText("+1 more name")).toBeInTheDocument();
    expect(listCryptoAssets).toHaveBeenCalledWith({ origin: "ct", limit: 1000 });
    fireEvent.click(within(screen.getByRole("group", { name: "Domain" })).getByText("tns.com.mx"));
    expect(onDomainChange).toHaveBeenCalledWith("tns.com.mx");
  });

  it("con un backend que aún no manda el dominio, lista igual (sin chips de dominio)", async () => {
    listCryptoAssets.mockResolvedValue({ items: ITEMS.map(({ domain: _d, ...a }) => a) });
    render(<PublicDomainCertificates refreshNonce={0} now={NOW} />);
    expect(await screen.findByText("mail.tns.com.mx")).toBeInTheDocument();
    expect(screen.queryByText(/No public certificates yet/)).toBeNull();
  });

  it("sin certificados todavía, lleva a añadir un dominio", async () => {
    listCryptoAssets.mockResolvedValue({ items: [] });
    const onOpenSettings = vi.fn();
    render(<PublicDomainCertificates refreshNonce={0} onOpenSettings={onOpenSettings} now={NOW} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a domain" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});

describe("Outside your devices → dominios públicos", () => {
  it("⭐ con origin=ct, Outside enseña la vista de dominios, no la tabla genérica", async () => {
    listCryptoAssets.mockResolvedValue({ items: ITEMS });
    render(<CbomAssetsPanel refreshNonce={0} origin="ct" domain="tns.com.mx" onSourceChange={vi.fn()} />);
    expect(await screen.findByText("Public domain certificates")).toBeInTheDocument();
    expect(screen.queryByText("api.tracenium.com")).toBeNull();
    expect(getCryptoAssetsSummary).not.toHaveBeenCalled();
  });

  it("⭐ los orígenes ct:… van en UN chip «Public domains», aunque el conector haya tenido varios nombres", async () => {
    getCryptoAssetsSummary.mockResolvedValue({
      sources: [
        { sourceName: "ct:tracenium.com+1", assets: 7 },
        { sourceName: "ct:tracenium.com+2", assets: 13 },
        { sourceName: "ssh:hosts", assets: 4 }
      ],
      byType: [], matchedFleetCertificates: 0, imports: []
    });
    listCryptoAssets.mockResolvedValue({ items: [] });
    const onSourceChange = vi.fn();
    render(<CbomAssetsPanel refreshNonce={0} onSourceChange={onSourceChange} />);
    fireEvent.click(await screen.findByText("Public domains · 20"));
    expect(onSourceChange).toHaveBeenCalledWith({ origin: "ct" });
    expect(screen.queryByText(/ct:tracenium\.com/)).toBeNull();
    expect(screen.getByText("ssh:hosts · 4")).toBeInTheDocument();
  });
});

describe("Settings → Public domains enlaza con sus certificados", () => {
  const CT = { connectorId: 2, kind: "ct", label: "Public domains", config: { domains: ["tracenium.com", "tns.com.mx"] }, enabled: true };

  it("⭐ «View certificates» abre todos; un dominio abre los suyos", () => {
    const onView = vi.fn();
    render(<CdpPublicDomains connectors={[CT]} onChanged={vi.fn()} onViewCertificates={onView} />);
    fireEvent.click(screen.getByRole("button", { name: "View certificates" }));
    expect(onView).toHaveBeenLastCalledWith();
    fireEvent.click(screen.getByText("tns.com.mx"));
    expect(onView).toHaveBeenLastCalledWith("tns.com.mx");
  });
});
