// src/components/CryptoDiscovery/CertificateDetailDrawer.endpoints.test.jsx
//
// Ola 1.2 — «dónde se sirve», en la ficha del certificado.
//
// La sección de equipos dice dónde está GUARDADO. Ésta dice dónde
// CONTESTA, que es lo que se pregunta quien lo va a reemplazar.
//
// ⭐ Lo que defiende: un extremo sin SNI se pinta como lo que es —lo que
// sirve la IP desnuda, un hecho medido— y nunca como un dato que falte; y
// el rango que lo encontró se nombra, porque es lo que distingue un
// servicio que alguien dio de alta de uno que apareció solo.

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
  keyFamily: "quantum_broken",
  devices: []
};

const ep = (over = {}) => ({
  agentId: "a1",
  source: "probe",
  targetHost: "10.0.4.17",
  port: 443,
  sni: null,
  sweepRange: null,
  protocol: "TLSv1.3",
  cipher: "TLS_AES_256_GCM_SHA384",
  kexGroup: "x25519",
  kemHybrid: false,
  lastSeen: "2026-09-20T10:00:00.000Z",
  ...over
});

const draw = (endpoints) =>
  render(<CertificateDetailDrawer fingerprint="x" initialDetail={{ ...base, endpoints }} />);

afterEach(() => cleanup());

describe("⭐ no SNI is what the bare IP serves, not a gap", () => {
  it("says «the bare IP» and never «unknown»", () => {
    draw([ep({ sni: null })]);
    expect(screen.getByText(/SNI: no SNI — the bare IP/)).toBeInTheDocument();
    // Las palabras que lo convertirían en un dato ausente no aparecen.
    expect(screen.queryByText(/SNI: unknown/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SNI: —/)).not.toBeInTheDocument();
  });

  it("the summary line counts them and explains what they are", () => {
    draw([ep({ sni: null }), ep({ targetHost: "lb.corp", sni: "lb.corp" })]);
    expect(screen.getByText(/1 served with no SNI: that is what the bare address answers with/i)).toBeInTheDocument();
  });

  it("a requested hostname is shown as itself", () => {
    draw([ep({ targetHost: "lb.corp", sni: "lb.corp" })]);
    expect(screen.getByText("SNI: lb.corp")).toBeInTheDocument();
    expect(screen.queryByText(/bare IP/)).not.toBeInTheDocument();
  });

  it("⭐ a local listener reads «n/a», not «no SNI»: it has no ClientHello", () => {
    draw([ep({ source: "listener", targetHost: null, port: 8443, sni: null })]);
    expect(screen.getByText(/SNI: n\/a — local listener/)).toBeInTheDocument();
    expect(screen.queryByText(/bare IP/)).not.toBeInTheDocument();
    // Y no infla el recuento de «servidos sin SNI».
    expect(screen.queryByText(/served with no SNI/i)).not.toBeInTheDocument();
  });
});

describe("⭐ the sweep range is the provenance", () => {
  it("names the range that found it and flags it as unexpected", () => {
    draw([ep({ sweepRange: "10.0.4.0/24" })]);
    expect(screen.getByText("swept 10.0.4.0/24")).toBeInTheDocument();
    expect(screen.getByText(/1 found by a range sweep — nobody listed those hosts/i)).toBeInTheDocument();
  });

  it("a named probe target is not dressed up as a discovery", () => {
    draw([ep({ targetHost: "lb.corp", sni: "lb.corp" })]);
    expect(screen.getByText("named target")).toBeInTheDocument();
    expect(screen.queryByText(/found by a range sweep/i)).not.toBeInTheDocument();
  });
});

describe("the endpoint row", () => {
  it("shows the address, the source and the handshake", () => {
    draw([ep({ sweepRange: "10.0.4.0/24" })]);
    expect(screen.getByText("10.0.4.17:443")).toBeInTheDocument();
    expect(screen.getByText("Network probe")).toBeInTheDocument();
    expect(screen.getByText(/TLSv1\.3 · TLS_AES_256_GCM_SHA384 · x25519/)).toBeInTheDocument();
    expect(screen.getByText(/Served at 1 endpoint/)).toBeInTheDocument();
  });

  it("⭐ an undetermined key exchange is not rendered as classical", () => {
    draw([ep({ kemHybrid: null })]);
    expect(screen.getByText("KEX not determined")).toBeInTheDocument();
    expect(screen.queryByText("classical KEX")).not.toBeInTheDocument();
  });

  it("a handshake with nothing recorded says so instead of showing an empty line", () => {
    draw([ep({ protocol: null, cipher: null, kexGroup: null })]);
    expect(screen.getByText(/handshake details not recorded/i)).toBeInTheDocument();
  });
});

describe("⭐ honest states", () => {
  it("no endpoints at all is «nothing was caught answering with it», not silence", () => {
    draw([]);
    expect(screen.getByText(/nothing was caught answering with it/i)).toBeInTheDocument();
  });

  it("⭐ a build that does not return the field renders NO section, rather than «0 endpoints»", () => {
    // Sin la migración 20261023 el backend ni siquiera responde; con un
    // backend anterior el campo falta. «Servido en 0 extremos» diría que no
    // se sirve en ninguna parte, que es lo contrario de no saberlo.
    render(<CertificateDetailDrawer fingerprint="x" initialDetail={base} />);
    expect(screen.queryByText(/Served at/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing was caught answering/i)).not.toBeInTheDocument();
  });
});
