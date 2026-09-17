// src/components/CryptoDiscovery/PqcReadinessPanels.test.jsx
//
// Repaso UI 2026-09-05: «todas las gráficas que permitan seleccionar
// certificados deberían llevarnos a su detalle». Estos tres paneles
// contaban y no navegaban. Lo que se fija: cada fila que cuenta algo
// navega con el filtro EXACTO de esa cifra, y las cifras sin filtro
// exacto se quedan inertes en vez de mentir.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { TrustAnchorsPanel, AgilityBlockersPanel, OsTlsFixablePanel } from "./PqcReadinessPanels";
import { OS_TLS_FIX_STATE } from "./osTlsFixStates";

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

  it("sin callback las filas no se anuncian como botones", () => {
    render(<TrustAnchorsPanel pqc={PQC} />);
    expect(screen.queryByRole("button", { name: /Open Corp Root CA/i })).not.toBeInTheDocument();
  });
});


// ADR-0024 F2 — «pueden migrar, pero requieren el fix», complemento de «cannot
// migrate yet». Los estados vienen de `agility.fixable[].state` (backend 411e2fd).
describe("OsTlsFixablePanel (ADR-0024)", () => {
  const conFixable = (fixable) => ({ ...PQC, agility: { ...PQC.agility, fixable } });
  const f = (agentId, host, state, reason = "why") => ({ agentId, host, state, version: "26200.9457", reason, detected: "Microsoft Windows 11 Pro", eccCurves: null, policyManaged: null, measuredAt: null });

  it("⭐ agrupa por estado con su recuento, en el orden de la acción, y un equipo lleva a Inventory", () => {
    const onSelectDevice = vi.fn();
    render(
      <OsTlsFixablePanel
        pqc={conFixable([
          f("u1", "OLD-PATCH", "needs_os_update"),
          f("a1", "W11-JPR-LAB02", "needs_fix", "the ML-KEM groups ship disabled on this build"),
          f("a2", "Emilio", "needs_fix"),
          f("g1", "CORP-01", "policy_managed")
        ])}
        onSelectDevice={onSelectDevice}
      />
    );
    expect(screen.getByText(/Devices that can migrate — need a fix \(4\)/)).toBeInTheDocument();
    const causas = screen.getAllByRole("button", { expanded: false }).map((b) => b.getAttribute("aria-label"));
    // Primero lo que está a un ajuste; la actualización del SO, lo último.
    expect(causas).toEqual([
      `${OS_TLS_FIX_STATE.needs_fix.label}: 2 device(s)`,
      `${OS_TLS_FIX_STATE.policy_managed.label}: 1 device(s)`,
      `${OS_TLS_FIX_STATE.needs_os_update.label}: 1 device(s)`
    ]);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`${OS_TLS_FIX_STATE.needs_fix.label}: 2`) }));
    fireEvent.click(screen.getByText("W11-JPR-LAB02"));
    expect(onSelectDevice).toHaveBeenCalledWith(expect.objectContaining({ agentId: "a1", host: "W11-JPR-LAB02" }));
  });

  it("⚠️ sin `fixable` (backend anterior) o vacío no se pinta: «nada que arreglar» se leería como «listo»", () => {
    const { container } = render(<OsTlsFixablePanel pqc={PQC} />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const vacio = render(<OsTlsFixablePanel pqc={conFixable([])} />);
    expect(vacio.container).toBeEmptyDOMElement();
  });

  it("un estado desconocido no se cuela con una etiqueta cruda", () => {
    render(<OsTlsFixablePanel pqc={conFixable([f("x", "X", "cannot_migrate"), f("a", "A", "needs_fix")])} />);
    expect(screen.getByText(/need a fix \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/cannot_migrate/)).not.toBeInTheDocument();
  });

  it("«cannot migrate yet» ya no manda a buscar ahí a los Windows con el grupo apagado: los envía al panel nuevo", () => {
    render(<AgilityBlockersPanel pqc={{ ...PQC, agility: { ...PQC.agility, blockers: [{ agentId: "w", host: "SRV-2022", runtime: "os-tls", version: "20348" }] } }} />);
    const causa = screen.getByRole("button", { name: /OS TLS stack below the threshold/ });
    expect(causa).toBeInTheDocument();
  });
});
