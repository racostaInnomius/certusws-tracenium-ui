// src/components/CryptoDiscovery/CertificateDetailDrawer.keyStorage.test.jsx
//
// Ola 1.1 — en la ficha: dónde vive la clave privada de cada equipo, si
// puede salir, y qué se sabe de la cadena en ESE almacén.
//
// ⭐ Lo que defiende: «no llega a una raíz de confianza» se pinta en gris y
// nunca en rojo. En Windows el almacén de raíces se rellena bajo demanda,
// así que eso se arregla solo — y un informe lleno de rojos que desaparecen
// es peor que no tener el dato.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../../api/cdp", () => ({ getCdpCertificateDetail: vi.fn() }));

import CertificateDetailDrawer from "./CertificateDetailDrawer";

const base = {
  fingerprint256: "cd".repeat(32),
  subjectCN: "svc.example.com",
  issuerCN: "Example CA",
  keyAlgorithm: "RSA",
  keySizeBits: 2048,
  keyFamily: "quantum_broken"
};

const device = (over = {}) => ({
  agentId: "a1",
  host: "host-1",
  storeName: "MY",
  storeScope: "machine",
  hasPrivateKey: true,
  keyExportable: false,
  keyStorage: "tpm",
  chain: null,
  flags: [],
  revocation: null,
  ...over
});

const draw = (d) => render(<CertificateDetailDrawer fingerprint="x" initialDetail={{ ...base, devices: [d] }} />);

afterEach(() => cleanup());

describe("⭐ no trusted root is never a red state", () => {
  it("is worded as «not reached yet» and explains that Windows fills the store on demand", () => {
    draw(device({ chain: { issuerFound: true, signatureValid: true, trusted: false } }));
    const chip = screen.getByText(/no trusted root reached yet/i);
    expect(chip).toBeInTheDocument();
    // Ninguna de las palabras que lo convertirían en una acusación.
    expect(screen.queryByText(/untrusted/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/chain rejected/i)).not.toBeInTheDocument();
  });

  it("a signature that does not match its issuer IS the red state, so the two look different", () => {
    draw(device({ chain: { issuerFound: true, signatureValid: false } }));
    expect(screen.getByText(/signature does not match its issuer/i)).toBeInTheDocument();
  });

  it("a missing issuer is a warning with the consequence spelled out", () => {
    draw(device({ chain: { issuerFound: false } }));
    expect(screen.getByText(/issuer not on the device/i)).toBeInTheDocument();
  });
});

describe("⭐ what the agent did not say is said", () => {
  it("names the chain keys that were never asserted", () => {
    draw(device({ chain: { issuerFound: true } }));
    const note = screen.getByText(/did not report signatureValid or trusted/i);
    expect(note.textContent).toMatch(/not the same as\s+a negative answer/i);
    // ⭐ Y sobre todo: una clave AUSENTE no se pinta como un «no». Leer
    // `undefined` como `false` inventaría dos veredictos por fila.
    expect(screen.queryByText(/no trusted root reached/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/signature does not match/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/chains to a trusted root/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/signature checks out/i)).not.toBeInTheDocument();
  });

  it("with everything asserted there is no such note", () => {
    draw(device({ chain: { issuerFound: true, signatureValid: true, trusted: true } }));
    expect(screen.queryByText(/did not report/i)).not.toBeInTheDocument();
  });

  it("⭐ no chain at all renders nothing, rather than an empty clean bill", () => {
    draw(device({ chain: null }));
    expect(screen.queryByText(/issuer on the device/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no trusted root reached/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/did not report/i)).not.toBeInTheDocument();
  });
});

describe("where the private key lives", () => {
  it("shows the storage and the exportability together", () => {
    draw(device({ keyStorage: "tpm", keyExportable: false }));
    expect(screen.getByText("TPM")).toBeInTheDocument();
    expect(screen.getByText("Non-exportable")).toBeInTheDocument();
  });

  it("⭐ unknown exportability is not shown as non-exportable", () => {
    draw(device({ keyStorage: "software", keyExportable: null }));
    expect(screen.getByText("Exportability unknown")).toBeInTheDocument();
    expect(screen.queryByText("Non-exportable")).not.toBeInTheDocument();
  });

  it("⭐ «not recorded» reads differently from the agent saying «unknown»", () => {
    draw(device({ keyStorage: null }));
    expect(screen.getByText("Storage not recorded")).toBeInTheDocument();
    cleanup();
    draw(device({ keyStorage: "unknown" }));
    expect(screen.getByText("Storage unknown")).toBeInTheDocument();
    expect(screen.queryByText("Storage not recorded")).not.toBeInTheDocument();
  });

  it("without a private key the question is not asked at all", () => {
    // El backend ni siquiera escribe los campos sin clave privada;
    // enseñar «desconocido» ahí sería inventar una pregunta.
    draw(device({ hasPrivateKey: false, keyStorage: null, keyExportable: null }));
    expect(screen.queryByText(/Storage/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Exportab/)).not.toBeInTheDocument();
  });
});

describe("the two store-chain flags read as sentences", () => {
  it("each flag chip carries the plain-language explanation", () => {
    render(
      <CertificateDetailDrawer
        fingerprint="x"
        initialDetail={{ ...base, devices: [device({ flags: ["store_chain_incomplete"] })] }}
        flagLabels={{ store_chain_incomplete: "The issuer of this certificate is not on the device" }}
      />
    );
    expect(screen.getByText("store_chain_incomplete")).toBeInTheDocument();
  });
});
