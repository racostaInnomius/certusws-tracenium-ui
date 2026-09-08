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
vi.mock("../../api/cdp", () => ({
  createCdpConnector: (...a) => createCdpConnector(...a),
  updateCdpConnector: (...a) => updateCdpConnector(...a),
  deleteCdpConnector: (...a) => deleteCdpConnector(...a)
}));

import CdpPublicDomains, { ctDomains } from "./CdpPublicDomains";

const CT = { connectorId: 2, kind: "ct", label: "Tracenium public domains", config: { domains: ["tracenium.com"], includeSubdomains: true, includeExpired: false }, enabled: true };
const KV = { connectorId: 1, kind: "keyvault", label: "Prod vault", config: { vaultUrl: "https://kv" }, enabled: true };

beforeEach(() => {
  createCdpConnector.mockResolvedValue({ ok: true, connector: { connectorId: 9 } });
  updateCdpConnector.mockResolvedValue({ ok: true });
  deleteCdpConnector.mockResolvedValue({ ok: true });
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

  it("ctDomains normaliza y deduplica lo que venga como texto o lista", () => {
    const rows = ctDomains([{ kind: "ct", config: { domains: "*.Example.com, example.com corp.net." } }, { kind: "keyvault", config: {} }]);
    expect(rows.map((r) => r.domain)).toEqual(["example.com", "corp.net"]);
  });
});
