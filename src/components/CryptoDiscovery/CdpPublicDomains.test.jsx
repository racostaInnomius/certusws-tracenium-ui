// src/components/CryptoDiscovery/CdpPublicDomains.test.jsx
//
// Los dominios públicos se añaden y quitan de uno en uno, siempre a la vista.
// Lo que destapó esto (08-sep): quitar el único dominio borró el conector y
// con él la única UI para poner otro (el tipo CT estaba enterrado en un
// desplegable de conectores).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const createCdpConnector = vi.fn();
const updateCdpConnector = vi.fn();
const deleteCdpConnector = vi.fn();
const runCdpConnector = vi.fn();
const listCdpConnectorRuns = vi.fn();
vi.mock("../../api/cdp", () => ({
  createCdpConnector: (...a) => createCdpConnector(...a),
  updateCdpConnector: (...a) => updateCdpConnector(...a),
  deleteCdpConnector: (...a) => deleteCdpConnector(...a),
  runCdpConnector: (...a) => runCdpConnector(...a),
  listCdpConnectorRuns: (...a) => listCdpConnectorRuns(...a),
  listCdpConnectors: vi.fn()
}));

import CdpPublicDomains, { ctDomains } from "./CdpPublicDomains";

const CT = { connectorId: 2, kind: "ct", label: "Tracenium public domains", config: { domains: ["tracenium.com"], includeSubdomains: true, includeExpired: false }, enabled: true };
const KV = { connectorId: 1, kind: "keyvault", label: "Prod vault", config: { vaultUrl: "https://kv" }, enabled: true };

beforeEach(() => {
  createCdpConnector.mockResolvedValue({ ok: true, connector: { connectorId: 9 } });
  updateCdpConnector.mockResolvedValue({ ok: true });
  deleteCdpConnector.mockResolvedValue({ ok: true });
  runCdpConnector.mockResolvedValue({ ok: true, summary: { certificates: 12, removed: 1, matchedFleetCertificates: 4 } });
  listCdpConnectorRuns.mockResolvedValue({ runs: [] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const type = (v) => fireEvent.change(screen.getByLabelText(/add a domain/i), { target: { value: v } });

describe("CdpPublicDomains", () => {
  it("⭐ sin conector CT el bloque está igual y el primer dominio lo crea sin credenciales", async () => {
    const onChanged = vi.fn();
    render(<CdpPublicDomains connectors={[KV]} onChanged={onChanged} />);
    expect(screen.getByText(/No domain watched yet/i)).toBeInTheDocument();
    type("Example.COM");
    fireEvent.click(screen.getByRole("button", { name: /add domain/i }));
    await waitFor(() => expect(createCdpConnector).toHaveBeenCalledWith({ kind: "ct", label: "Public domains", config: { domains: ["example.com"], includeSubdomains: true, includeExpired: false }, clientSecret: "" }));
    expect(await screen.findByText(/example\.com added/i)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("con conector CT, un dominio nuevo se suma a su lista (no crea otro conector)", async () => {
    render(<CdpPublicDomains connectors={[KV, CT]} onChanged={vi.fn()} />);
    expect(screen.getByText("tracenium.com")).toBeInTheDocument();
    type("corp.example.net");
    fireEvent.click(screen.getByRole("button", { name: /add domain/i }));
    await waitFor(() => expect(updateCdpConnector).toHaveBeenCalledWith(2, { config: { domains: ["tracenium.com", "corp.example.net"], includeSubdomains: true, includeExpired: false } }));
    expect(createCdpConnector).not.toHaveBeenCalled();
  });

  it("lo que no es un dominio se rechaza sin llamar al servidor", async () => {
    render(<CdpPublicDomains connectors={[CT]} onChanged={vi.fn()} />);
    type("https://tracenium.com/login");
    fireEvent.click(screen.getByRole("button", { name: /add domain/i }));
    expect(await screen.findByText(/is not a domain name/i)).toBeInTheDocument();
    expect(updateCdpConnector).not.toHaveBeenCalled();
    expect(createCdpConnector).not.toHaveBeenCalled();
  });

  it("quitar un dominio que no es el último actualiza la lista", async () => {
    const two = { ...CT, config: { ...CT.config, domains: ["tracenium.com", "corp.example.net"] } };
    render(<CdpPublicDomains connectors={[two]} onChanged={vi.fn()} />);
    const chip = screen.getByText("corp.example.net").closest(".MuiChip-root");
    fireEvent.click(chip.querySelector(".MuiChip-deleteIcon"));
    await waitFor(() => expect(updateCdpConnector).toHaveBeenCalledWith(2, { config: { domains: ["tracenium.com"], includeSubdomains: true, includeExpired: false } }));
    expect(deleteCdpConnector).not.toHaveBeenCalled();
  });

  it("⚠️ quitar el ÚLTIMO dominio pide confirmación y dice que se retira lo que trajo; el bloque sigue ahí", async () => {
    render(<CdpPublicDomains connectors={[CT]} onChanged={vi.fn()} />);
    const chip = screen.getByText("tracenium.com").closest(".MuiChip-root");
    fireEvent.click(chip.querySelector(".MuiChip-deleteIcon"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/last domain/i);
    expect(deleteCdpConnector).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /remove domain/i }));
    await waitFor(() => expect(deleteCdpConnector).toHaveBeenCalledWith(2));
    // La UI para volver a añadir no se va con el conector.
    expect(screen.getByLabelText(/add a domain/i)).toBeInTheDocument();
  });

  it("⭐ «Run now» vive aquí: el refactor por sectores dejó al conector CT sin ninguna fila, y con ella se fue la lectura manual", async () => {
    const onChanged = vi.fn();
    render(<CdpPublicDomains connectors={[KV, { ...CT, lastRunAt: "2026-09-17T22:31:00Z", lastStatus: "ok", lastSummary: { certificates: 11 } }]} onChanged={onChanged} />);
    expect(screen.getByText(/Last read .* · 11 certificate\(s\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(runCdpConnector).toHaveBeenCalledWith(2, { dryRun: false }));
    expect(await screen.findByText(/Read: 12 certificate\(s\) · 1 retired · 4 also on your devices/)).toBeInTheDocument();
    // Lo que trajo cambia Explore y el roadmap: el padre tiene que recargar.
    expect(onChanged).toHaveBeenCalled();
  });

  it("«Test» pregunta a crt.sh sin importar nada, y un fallo se lee", async () => {
    render(<CdpPublicDomains connectors={[CT]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => expect(runCdpConnector).toHaveBeenCalledWith(2, { dryRun: true }));
    expect(await screen.findByText(/Nothing was imported/)).toBeInTheDocument();
    runCdpConnector.mockRejectedValueOnce(new Error("crt.sh timed out"));
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText("crt.sh timed out")).toBeInTheDocument();
  });

  it("sin dominios no hay nada que leer: ni estado ni botones", () => {
    render(<CdpPublicDomains connectors={[KV]} onChanged={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();
  });

  it("⚠️ un conector CT deshabilitado se ve y se puede volver a habilitar (no hay otra UI que lo liste)", async () => {
    render(<CdpPublicDomains connectors={[{ ...CT, enabled: false }]} onChanged={vi.fn()} />);
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run now" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(updateCdpConnector).toHaveBeenCalledWith(2, { enabled: true }));
  });

  it("⭐ una lectura «ok» que dejó un dominio fuera lo DICE: ni cifra corta sin explicación ni chip verde a secas", async () => {
    const partial = { ...CT, lastRunAt: "2026-09-20T03:00:00Z", lastStatus: "ok", lastSummary: { certificates: 8, problems: ["ddi-tx.net: crt.sh is rate-limiting or overloaded (HTTP 502)."] } };
    render(<CdpPublicDomains connectors={[partial]} onChanged={vi.fn()} />);
    expect(screen.getByText("1 not read")).toBeInTheDocument();
    // Y lo que trajeron esos dominios NO se da por desaparecido.
    expect(screen.getByText(/left 1 domain\(s\) out/)).toHaveTextContent(/nothing\s+was retired for them/);
    expect(screen.getByText(/^ddi-tx\.net: crt\.sh is rate-limiting/)).toBeInTheDocument();
  });

  it("«Run now» que termina con avisos los repite en el mensaje", async () => {
    runCdpConnector.mockResolvedValueOnce({ ok: true, summary: { certificates: 12, removed: 0, matchedFleetCertificates: 1, problems: ["ddi-tx.net: crt.sh is rate-limiting or overloaded (HTTP 502)."] } });
    render(<CdpPublicDomains connectors={[CT]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    expect(await screen.findByText(/Not read this time: ddi-tx\.net/)).toBeInTheDocument();
  });

  it("⭐ la clave del proveedor es de Tracenium: el cliente no se da de alta en nada ni ve un campo de credencial", () => {
    render(<CdpPublicDomains connectors={[CT]} onChanged={vi.fn()} />);
    expect(screen.getByText(/Tracenium subscribes to — nothing for you to sign up for or pay separately/)).toBeInTheDocument();
    // Y lo que importa operativamente: nunca se queda sin fuente.
    expect(screen.getByText(/crt\.sh\s+stays as the fallback/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /key/i })).toBeNull();
  });

  it("⭐ la cifra dice de qué proveedor sale: crt.sh y CertSpotter no ven lo mismo", () => {
    const read = { ...CT, hasSecret: true, lastRunAt: "2026-09-20T03:00:00Z", lastStatus: "ok", lastSummary: { certificates: 1, provider: "certspotter" } };
    render(<CdpPublicDomains connectors={[read]} onChanged={vi.fn()} />);
    expect(screen.getByText(/1 certificate\(s\) · via CertSpotter/)).toBeInTheDocument();
  });

  it("el historial de lecturas se despliega aquí", async () => {
    listCdpConnectorRuns.mockResolvedValue({ runs: [{ runId: 7, startedAt: "2026-09-17T22:31:00Z", trigger: "scheduled", status: "failed", error: "crt.sh HTTP 502" }] });
    render(<CdpPublicDomains connectors={[CT]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByText("crt.sh HTTP 502")).toBeInTheDocument();
    await waitFor(() => expect(listCdpConnectorRuns).toHaveBeenCalledWith(2, { limit: 20 }));
  });

  it("⭐ ADR-0026 · el tope del paquete se dice antes de ir al servidor, y dice qué lo levanta", async () => {
    const tres = { ...CT, config: { ...CT.config, domains: ["a.com", "b.com", "c.com"] } };
    render(<CdpPublicDomains connectors={[tres]} onChanged={vi.fn()} maxDomains={3} />);
    expect(screen.getByText("3 of 3 included in your package")).toBeInTheDocument();
    type("d.com");
    fireEvent.click(screen.getByRole("button", { name: /add domain/i }));
    expect(await screen.findByText(/CDP Coverage lifts the limit; nothing you already watch is affected/)).toBeInTheDocument();
    // Ni una llamada: el tope se conoce aquí.
    expect(updateCdpConnector).not.toHaveBeenCalled();
  });

  it("con el complemento no hay contador ni tope propio", async () => {
    const tres = { ...CT, config: { ...CT.config, domains: ["a.com", "b.com", "c.com"] } };
    render(<CdpPublicDomains connectors={[tres]} onChanged={vi.fn()} />);
    expect(screen.queryByText(/included in your package/)).toBeNull();
    type("d.com");
    fireEvent.click(screen.getByRole("button", { name: /add domain/i }));
    await waitFor(() => expect(updateCdpConnector).toHaveBeenCalled());
  });

  it("ctDomains normaliza y deduplica lo que venga como texto o lista", () => {
    const rows = ctDomains([{ kind: "ct", config: { domains: "*.Example.com, example.com corp.net." } }, { kind: "keyvault", config: {} }]);
    expect(rows.map((r) => r.domain)).toEqual(["example.com", "corp.net"]);
  });
});
