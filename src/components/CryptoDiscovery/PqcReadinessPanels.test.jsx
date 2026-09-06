// src/components/CryptoDiscovery/PqcReadinessPanels.test.jsx
//
// Repaso UI 2026-09-05: «todas las gráficas que permitan seleccionar
// certificados deberían llevarnos a su detalle». Estos tres paneles
// contaban y no navegaban. Lo que se fija: cada fila que cuenta algo
// navega con el filtro EXACTO de esa cifra, y las cifras sin filtro
// exacto (las dos clases post-cuánticas de CNSA) se quedan inertes en vez
// de mentir.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { TrustAnchorsPanel, AgilityBlockersPanel, CnsaPanel } from "./PqcReadinessPanels";

const PQC = {
  disallowedYear: 2035,
  trustAnchorsAtRisk: [
    { fingerprint256: "a".repeat(64), subjectCN: "Corp Root CA", keyAlgorithm: "RSA", keySizeBits: 4096, notAfter: "2040-01-01T00:00:00Z", deviceCount: 53 }
  ],
  agility: {
    jvmMinMajor: 24,
    opensslMinVersion: "3.5",
    windowsMinBuild: 26100,
    macosMinMajor: 26,
    blockers: [
      { agentId: "a1", host: "SRV-JAVA-01", runtime: "jvm", version: "8.0.392", reason: "JDK 8 has no ML-KEM" },
      { agentId: "a1", host: "SRV-JAVA-01", runtime: "openssl", version: "1.1.1", reason: "OpenSSL 1.1.1 has no ML-KEM" }
    ]
  },
  cnsa: {
    applicability: "Mandatory for US National Security Systems only.",
    gates: [{ date: "2027-01-01", label: "CNSA 2.0 in new products", passed: false, daysRemaining: 480 }],
    certificates: { total: 100, approved: 0, pqNotApproved: 0, quantumVulnerable: 95, unknown: 5, weakDigest: 0 }
  }
};

afterEach(() => cleanup());

describe("PqcReadinessPanels — drill-down", () => {
  it("⭐ un ancla a reemplazar abre su certificado", () => {
    const onSelect = vi.fn();
    render(<TrustAnchorsPanel pqc={PQC} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Open Corp Root CA/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ fingerprint256: "a".repeat(64) }));
  });

  it("⭐ los bloqueos se agrupan por causa con su recuento; una causa se despliega a sus equipos, que llevan a Inventory", () => {
    const onSelectDevice = vi.fn();
    render(<AgilityBlockersPanel pqc={PQC} onSelectDevice={onSelectDevice} />);
    // Un equipo con dos causas cuenta una vez en el título y una vez por causa.
    expect(screen.getByText(/Devices that cannot migrate yet \(1\)/)).toBeInTheDocument();
    const jvm = screen.getByRole("button", { name: /Java below 24: 1 device/i });
    expect(screen.getByRole("button", { name: /OpenSSL below 3.5: 1 device/i })).toBeInTheDocument();
    // Cerrado no enseña equipos: la lista larga era el problema.
    expect(screen.queryByText("SRV-JAVA-01")).not.toBeInTheDocument();
    fireEvent.click(jvm);
    fireEvent.click(screen.getByText("SRV-JAVA-01"));
    expect(onSelectDevice).toHaveBeenCalledWith(expect.objectContaining({ agentId: "a1", host: "SRV-JAVA-01" }));
  });

  it("CNSA: lo cuántico-vulnerable navega por familia; lo post-cuántico sin filtro exacto NO navega", () => {
    const onSelect = vi.fn();
    render(<CnsaPanel pqc={PQC} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Quantum-vulnerable: 95/i }));
    expect(onSelect).toHaveBeenLastCalledWith({ family: "quantum_broken" });
    fireEvent.click(screen.getByRole("button", { name: /Not classified: 5/i }));
    expect(onSelect).toHaveBeenLastCalledWith({ family: "unknown" });
    // «Approved parameter sets» comparte familia pq_safe con «not
    // approved»: un filtro que enseñara los dos juntos mentiría.
    expect(screen.queryByRole("button", { name: /Approved parameter sets/i })).not.toBeInTheDocument();
  });

  it("sin callback las filas no se anuncian como botones", () => {
    render(<TrustAnchorsPanel pqc={PQC} />);
    expect(screen.queryByRole("button", { name: /Open Corp Root CA/i })).not.toBeInTheDocument();
  });
});
