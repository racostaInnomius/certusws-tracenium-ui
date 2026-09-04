// src/components/CryptoDiscovery/CdpConnectorsPanel.test.jsx
//
// Fase 4c: el conector Key Vault se crea con el secreto UNA vez, sin la
// clave de sellado del servidor no se puede crear, y «Test» no escribe.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const listCdpConnectors = vi.fn();
const createCdpConnector = vi.fn();
const runCdpConnector = vi.fn();
vi.mock("../../api/cdp", () => ({
  listCdpConnectors: (...a) => listCdpConnectors(...a),
  createCdpConnector: (...a) => createCdpConnector(...a),
  runCdpConnector: (...a) => runCdpConnector(...a),
  updateCdpConnector: vi.fn(),
  deleteCdpConnector: vi.fn()
}));

import CdpConnectorsPanel from "./CdpConnectorsPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CFG = { vaultUrl: "https://kv-prod.vault.azure.net", tenantId: "11111111-2222-3333-4444-555555555555", clientId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };

describe("CdpConnectorsPanel", () => {
  it("⭐ sin clave de sellado en el servidor lo dice y no deja crear", async () => {
    listCdpConnectors.mockResolvedValue({ ok: true, secretsConfigured: false, connectors: [] });
    render(<CdpConnectorsPanel refreshNonce={0} />);
    expect(await screen.findByText(/CDP_CONNECTOR_SECRETS_KEY/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add key vault/i })).toBeDisabled();
  });

  it("⭐ crea el conector con la config y el secreto, y no vuelve a pedir el secreto", async () => {
    listCdpConnectors.mockResolvedValue({ ok: true, secretsConfigured: true, connectors: [] });
    createCdpConnector.mockResolvedValue({ ok: true, connector: { connectorId: 1, label: "Prod", config: CFG, enabled: true, hasSecret: true } });
    render(<CdpConnectorsPanel refreshNonce={0} />);
    await screen.findByRole("button", { name: /add key vault/i });
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Prod" } });
    fireEvent.change(screen.getByLabelText(/vault url/i), { target: { value: CFG.vaultUrl } });
    fireEvent.change(screen.getByLabelText(/directory \(tenant\) id/i), { target: { value: CFG.tenantId } });
    fireEvent.change(screen.getByLabelText(/application \(client\) id/i), { target: { value: CFG.clientId } });
    fireEvent.change(screen.getByLabelText(/client secret/i), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: /add key vault/i }));
    await waitFor(() => expect(createCdpConnector).toHaveBeenCalledWith({ kind: "keyvault", label: "Prod", config: CFG, clientSecret: "s3cret" }));
    // El campo se vacía: el secreto no se queda en pantalla.
    await waitFor(() => expect(screen.getByLabelText(/client secret/i).value).toBe(""));
  });

  it("«Test» corre en seco y enseña lo que el vault contesta; un fallo enseña el motivo", async () => {
    listCdpConnectors.mockResolvedValue({
      ok: true,
      secretsConfigured: true,
      connectors: [{ connectorId: 5, label: "Prod", config: CFG, enabled: true, hasSecret: true, lastStatus: "ok", lastRunAt: "2026-09-04T10:00:00Z", lastSummary: { certificates: 12, keys: 3, complete: true } }]
    });
    runCdpConnector.mockResolvedValueOnce({ ok: true, dryRun: true, summary: { certificates: 12, keys: 3, complete: true } });
    render(<CdpConnectorsPanel refreshNonce={0} />);
    await screen.findByText("Prod");
    expect(screen.getByText(/12 certificate\(s\), 3 key\(s\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^test$/i }));
    await waitFor(() => expect(runCdpConnector).toHaveBeenCalledWith(5, { dryRun: true }));
    expect(await screen.findByText(/Connection OK: 12 certificate\(s\), 3 key\(s\)/)).toBeInTheDocument();

    runCdpConnector.mockRejectedValueOnce(new Error("list certificates: Key Vault denied access (HTTP 403)"));
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));
    expect(await screen.findByText(/denied access \(HTTP 403\)/)).toBeInTheDocument();
  });
});
