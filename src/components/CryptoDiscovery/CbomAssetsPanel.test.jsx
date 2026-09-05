// src/components/CryptoDiscovery/CbomAssetsPanel.test.jsx
//
// Fase 4: un CBOM importado se enseña con su origen, cruza con la flota
// por huella, y el import exige decir de dónde viene.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const getCryptoAssetsSummary = vi.fn();
const listCryptoAssets = vi.fn();
const importCdpCbom = vi.fn();
vi.mock("../../api/cdp", () => ({
  getCryptoAssetsSummary: (...a) => getCryptoAssetsSummary(...a),
  listCryptoAssets: (...a) => listCryptoAssets(...a),
  importCdpCbom: (...a) => importCdpCbom(...a),
  listCdpConnectors: vi.fn(async () => ({ ok: true, secretsConfigured: true, connectors: [] })),
  createCdpConnector: vi.fn(),
  updateCdpConnector: vi.fn(),
  deleteCdpConnector: vi.fn(),
  runCdpConnector: vi.fn()
}));

import CbomAssetsPanel, { CbomImportForm } from "./CbomAssetsPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CbomAssetsPanel", () => {
  it("vacío dice cómo empezar, no pinta una tabla en blanco", async () => {
    getCryptoAssetsSummary.mockResolvedValue({ sources: [], byType: [], matchedFleetCertificates: 0, imports: [] });
    listCryptoAssets.mockResolvedValue({ items: [] });
    render(<CbomAssetsPanel refreshNonce={0} onSelect={() => {}} />);
    expect(await screen.findByText(/Nothing outside your devices yet/i)).toBeInTheDocument();
  });

  it("⭐ enseña por origen, cruza con la flota y un certificado visto por un agente navega a él", async () => {
    getCryptoAssetsSummary.mockResolvedValue({
      sources: [{ sourceName: "trivy", assets: 3, lastSeen: null }],
      byType: [{ assetType: "certificate", family: "quantum_broken", assets: 2 }, { assetType: "algorithm", family: "pq_safe", assets: 1 }],
      matchedFleetCertificates: 1, imports: []
    });
    listCryptoAssets.mockResolvedValue({
      items: [
        { assetId: "1", sourceName: "trivy", assetType: "certificate", name: "api.corp", fingerprint256: "a".repeat(64), algorithmName: "RSA", keySizeBits: 2048, family: "quantum_broken", inFleet: true },
        { assetId: "2", sourceName: "trivy", assetType: "certificate", name: "old.corp", fingerprint256: "b".repeat(64), family: "quantum_broken", inFleet: false }
      ]
    });
    const onSelect = vi.fn();
    render(<CbomAssetsPanel refreshNonce={0} onSelect={onSelect} />);
    expect(await screen.findByText(/trivy · 3/)).toBeInTheDocument();
    expect(screen.getByText(/1 certificate\(s\) also on your devices/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("seen by an agent"));
    expect(onSelect).toHaveBeenCalledWith({ search: "a".repeat(64) });
    expect(screen.getByText("not on any device")).toBeInTheDocument();
  });
});

describe("CbomImportForm", () => {
  it("⭐ exige origen y fichero; importa el JSON parseado", async () => {
    importCdpCbom.mockResolvedValue({ ok: true, accepted: 5, components: 7, skipped: 2, removed: 0, matchedFleetCertificates: 1, problems: [] });
    const onImported = vi.fn();
    render(<CbomImportForm onImported={onImported} />);
    const button = () => screen.getByRole("button", { name: /^Import$/ });
    expect(button()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Source/i), { target: { value: "ci" } });
    const file = new File([JSON.stringify({ bomFormat: "CycloneDX", components: [] })], "cbom.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/CycloneDX file/i), { target: { files: [file] } });
    await waitFor(() => expect(button()).toBeEnabled());
    fireEvent.click(button());
    await waitFor(() => expect(importCdpCbom).toHaveBeenCalledWith("ci", { bomFormat: "CycloneDX", components: [] }));
    expect(await screen.findByText(/Imported 5 crypto asset/)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalled();
  });

  it("un fichero que no es JSON lo dice", async () => {
    render(<CbomImportForm />);
    fireEvent.change(screen.getByLabelText(/Source/i), { target: { value: "ci" } });
    fireEvent.change(screen.getByLabelText(/CycloneDX file/i), { target: { files: [new File(["nope"], "x.json")] } });
    await waitFor(() => expect(screen.getByRole("button", { name: /^Import$/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^Import$/ }));
    expect(await screen.findByText(/not valid JSON/i)).toBeInTheDocument();
    expect(importCdpCbom).not.toHaveBeenCalled();
  });
});
