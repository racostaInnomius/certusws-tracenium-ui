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
    expect(screen.getByRole("button", { name: /add azure key vault/i })).toBeDisabled();
  });

  it("⭐ crea el conector con la config y el secreto, y no vuelve a pedir el secreto", async () => {
    listCdpConnectors.mockResolvedValue({ ok: true, secretsConfigured: true, connectors: [] });
    createCdpConnector.mockResolvedValue({ ok: true, connector: { connectorId: 1, label: "Prod", config: CFG, enabled: true, hasSecret: true } });
    render(<CdpConnectorsPanel refreshNonce={0} />);
    await screen.findByRole("button", { name: /add azure key vault/i });
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Prod" } });
    fireEvent.change(screen.getByLabelText(/vault url/i), { target: { value: CFG.vaultUrl } });
    fireEvent.change(screen.getByLabelText(/directory \(tenant\) id/i), { target: { value: CFG.tenantId } });
    fireEvent.change(screen.getByLabelText(/application \(client\) id/i), { target: { value: CFG.clientId } });
    fireEvent.change(screen.getByLabelText(/client secret/i), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: /add azure key vault/i }));
    await waitFor(() => expect(createCdpConnector).toHaveBeenCalledWith({ kind: "keyvault", label: "Prod", config: CFG, clientSecret: "s3cret" }));
    // El campo se vacía: el secreto no se queda en pantalla.
    await waitFor(() => expect(screen.getByLabelText(/client secret/i).value).toBe(""));
  });

  it("«Test» corre en seco y enseña lo que el vault contesta; un fallo enseña el motivo", async () => {
    listCdpConnectors.mockResolvedValue({
      ok: true,
      secretsConfigured: true,
      connectors: [{ connectorId: 5, kind: "keyvault", label: "Prod", config: CFG, enabled: true, hasSecret: true, lastStatus: "ok", lastRunAt: "2026-09-04T10:00:00Z", lastSummary: { certificates: 12, keys: 3, complete: true } }]
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

describe("ConnectorForm — ACM", () => {
  it("⭐ con kind acm pide region + access key + secret y manda config de ACM", async () => {
    listCdpConnectors.mockResolvedValue({ ok: true, secretsConfigured: true, connectors: [] });
    createCdpConnector.mockResolvedValue({ ok: true, connector: { connectorId: 2, kind: "acm", label: "AWS", config: { region: "us-east-1", accessKeyId: "AKIAIOSFODNN7EXAMPLE" }, enabled: true, hasSecret: true } });
    render(<CdpConnectorsPanel refreshNonce={0} />);
    await screen.findByRole("button", { name: /add azure key vault/i });
    // MUI select: se abre y se elige.
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /kind/i }));
    fireEvent.click(await screen.findByRole("option", { name: /aws certificate manager/i }));
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "AWS" } });
    fireEvent.change(screen.getByLabelText(/^region/i), { target: { value: "us-east-1" } });
    fireEvent.change(screen.getByLabelText(/access key id/i), { target: { value: "AKIAIOSFODNN7EXAMPLE" } });
    fireEvent.change(screen.getByLabelText(/secret access key/i), { target: { value: "wJalr" } });
    expect(screen.getByText(/acm:ExportCertificate/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add aws certificate manager/i }));
    await waitFor(() => expect(createCdpConnector).toHaveBeenCalledWith({ kind: "acm", label: "AWS", config: { region: "us-east-1", accessKeyId: "AKIAIOSFODNN7EXAMPLE" }, clientSecret: "wJalr" }));
  });
});

describe("ConnectorForm — GCP", () => {
  it("con kind gcp pide project id + clave JSON y la manda como secreto", async () => {
    listCdpConnectors.mockResolvedValue({ ok: true, secretsConfigured: true, connectors: [] });
    createCdpConnector.mockResolvedValue({ ok: true, connector: { connectorId: 3, kind: "gcp", label: "GCP", config: { projectId: "acme-prod" }, enabled: true, hasSecret: true } });
    render(<CdpConnectorsPanel refreshNonce={0} />);
    await screen.findByRole("button", { name: /add azure key vault/i });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /kind/i }));
    fireEvent.click(await screen.findByRole("option", { name: /google cloud/i }));
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "GCP" } });
    fireEvent.change(screen.getByLabelText(/project id/i), { target: { value: "acme-prod" } });
    fireEvent.change(screen.getByLabelText(/service account json key/i), { target: { value: '{"type":"service_account"}' } });
    expect(screen.getByText(/compute\.sslCertificates\.list/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add google cloud/i }));
    await waitFor(() => expect(createCdpConnector).toHaveBeenCalledWith({ kind: "gcp", label: "GCP", config: { projectId: "acme-prod" }, clientSecret: '{"type":"service_account"}' }));
  });
});

describe("ConnectorForm — HashiCorp Vault", () => {
  it("con kind vault pide dirección, mounts, AppRole (role id + secret id) y CA opcional", async () => {
    listCdpConnectors.mockResolvedValue({ ok: true, secretsConfigured: true, connectors: [] });
    createCdpConnector.mockResolvedValue({ ok: true, connector: { connectorId: 4, kind: "vault", label: "Corp PKI", config: { vaultUrl: "https://vault.corp.example:8200", mounts: ["pki"] }, enabled: true, hasSecret: true } });
    render(<CdpConnectorsPanel refreshNonce={0} />);
    await screen.findByRole("button", { name: /add azure key vault/i });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /kind/i }));
    fireEvent.click(await screen.findByRole("option", { name: /hashicorp vault/i }));
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Corp PKI" } });
    fireEvent.change(screen.getByLabelText(/vault address/i), { target: { value: "https://vault.corp.example:8200" } });
    fireEvent.change(screen.getByLabelText(/pki mounts/i), { target: { value: "pki, pki_int" } });
    fireEvent.change(screen.getByLabelText(/role id/i), { target: { value: "r-1" } });
    fireEvent.change(screen.getByLabelText(/secret id/i), { target: { value: "sid" } });
    expect(screen.getByText(/verification is never disabled/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add hashicorp vault/i }));
    await waitFor(() =>
      expect(createCdpConnector).toHaveBeenCalledWith({
        kind: "vault",
        label: "Corp PKI",
        config: { vaultUrl: "https://vault.corp.example:8200", namespace: undefined, mounts: "pki, pki_int", authMethod: "approle", roleId: "r-1", caPem: undefined },
        clientSecret: "sid"
      })
    );
  });
});

describe("ConnectorForm — Kubernetes", () => {
  it("con kind k8s pide API server, namespaces, modo de secrets y token", async () => {
    listCdpConnectors.mockResolvedValue({ ok: true, secretsConfigured: true, connectors: [] });
    createCdpConnector.mockResolvedValue({ ok: true, connector: { connectorId: 5, kind: "k8s", label: "Prod cluster", config: { apiServer: "https://k8s.corp.example:6443", namespaces: [], readSecrets: true }, enabled: true, hasSecret: true } });
    render(<CdpConnectorsPanel refreshNonce={0} />);
    await screen.findByRole("button", { name: /add azure key vault/i });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /kind/i }));
    fireEvent.click(await screen.findByRole("option", { name: /^kubernetes$/i }));
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Prod cluster" } });
    fireEvent.change(screen.getByLabelText(/api server/i), { target: { value: "https://k8s.corp.example:6443" } });
    fireEvent.change(screen.getByLabelText(/service account token/i), { target: { value: "eyJ" } });
    expect(screen.getByText(/discards the rest in the same step/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add kubernetes/i }));
    await waitFor(() =>
      expect(createCdpConnector).toHaveBeenCalledWith({ kind: "k8s", label: "Prod cluster", config: { apiServer: "https://k8s.corp.example:6443", namespaces: "", readSecrets: true, caPem: undefined }, clientSecret: "eyJ" })
    );
  });
});

describe("ConnectorForm — Public CT logs", () => {
  it("⭐ no pide secreto y se puede crear aunque el servidor no tenga clave de sellado", async () => {
    listCdpConnectors.mockResolvedValue({ ok: true, secretsConfigured: false, connectors: [] });
    createCdpConnector.mockResolvedValue({ ok: true, connector: { connectorId: 6, kind: "ct", label: "Our domains", config: { domains: ["example.com"] }, enabled: true, hasSecret: false } });
    render(<CdpConnectorsPanel refreshNonce={0} />);
    await screen.findByText(/CDP_CONNECTOR_SECRETS_KEY/);
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /kind/i }));
    fireEvent.click(await screen.findByRole("option", { name: /public ct logs/i }));
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Our domains" } });
    fireEvent.change(screen.getByLabelText(/^domains/i), { target: { value: "example.com, corp.example.net" } });
    expect(screen.queryByLabelText(/secret/i)).not.toBeInTheDocument();
    const add = screen.getByRole("button", { name: /add public ct logs/i });
    expect(add).not.toBeDisabled();
    fireEvent.click(add);
    await waitFor(() =>
      expect(createCdpConnector).toHaveBeenCalledWith({ kind: "ct", label: "Our domains", config: { domains: "example.com, corp.example.net", includeSubdomains: true, includeExpired: false }, clientSecret: "" })
    );
  });
});
