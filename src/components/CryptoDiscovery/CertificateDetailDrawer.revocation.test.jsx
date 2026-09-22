// src/components/CryptoDiscovery/CertificateDetailDrawer.revocation.test.jsx
//
// La ficha del certificado: el chip de revocación por equipo.
//
// ⚠️ El fallo que esto fija: todo lo que no era `revoked` se pintaba «not
// revoked» en verde, incluido `unknown` —la CRL no bajó, el OCSP no
// contestó o su firma no verificó—. Es exactamente la afirmación que no se
// pudo hacer. Y desde la ola 1.7 la fuente puede ser CRL u OCSP: se dice.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../../api/cdp", () => ({ getCdpCertificateDetail: vi.fn() }));

import CertificateDetailDrawer from "./CertificateDetailDrawer";

const detail = (revocation) => ({
  fingerprint256: "cd".repeat(32),
  subjectCN: "svc.example.com",
  issuerCN: "Example CA",
  keyAlgorithm: "RSA",
  keySizeBits: 2048,
  keyFamily: "quantum_broken",
  devices: [{ agentId: "a1", host: "host-1", storeName: "MY", storeScope: "machine", flags: [], revocation }]
});

afterEach(() => cleanup());

describe("chip de revocación", () => {
  it("⭐ `unknown` es «could not be verified», nunca «not revoked»", () => {
    render(<CertificateDetailDrawer fingerprint="x" initialDetail={detail({ status: "unknown", source: "ocsp", checkedAt: "2026-09-22T10:00:00Z" })} />);

    expect(screen.getByText("revocation could not be verified · OCSP")).toBeInTheDocument();
    expect(screen.queryByText(/not revoked/)).toBeNull();
  });

  it("`good` por OCSP dice la fuente", () => {
    render(<CertificateDetailDrawer fingerprint="x" initialDetail={detail({ status: "good", source: "ocsp", checkedAt: "2026-09-22T10:00:00Z" })} />);
    expect(screen.getByText("not revoked · OCSP")).toBeInTheDocument();
  });

  it("`revoked` por CRL dice la fuente", () => {
    render(<CertificateDetailDrawer fingerprint="x" initialDetail={detail({ status: "revoked", source: "crl", checkedAt: "2026-09-22T10:00:00Z" })} />);
    expect(screen.getByText("REVOKED · CRL")).toBeInTheDocument();
  });

  it("sin comprobación sigue siendo «not checked»", () => {
    render(<CertificateDetailDrawer fingerprint="x" initialDetail={detail(null)} />);
    expect(screen.getByText("revocation not checked")).toBeInTheDocument();
  });

  it("un estado que la UI no conoce tampoco se pinta como bueno", () => {
    render(<CertificateDetailDrawer fingerprint="x" initialDetail={detail({ status: "pending", source: "crl" })} />);
    expect(screen.getByText("revocation could not be verified · CRL")).toBeInTheDocument();
  });
});
