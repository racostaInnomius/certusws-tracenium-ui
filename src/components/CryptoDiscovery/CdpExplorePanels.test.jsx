// src/components/CryptoDiscovery/CdpExplorePanels.test.jsx
//
// Fase 1 del análisis de madurez: los paneles nuevos NAVEGAN.
//
// La crítica al tablero anterior era que sus números no llevaban a nada.
// Lo que se fija aquí es la propiedad contraria: cada escalón del embudo,
// cada segmento de la distribución y cada fila de almacenes llama a
// onSelect con el filtro exacto de su lista. Y que el aviso de «solo
// cacerts» aparece cuando los keystores Java son todos del fabricante —
// el dato que en producción cambia la prioridad.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import {
  ExposureFunnel,
  KeyDistributionPanel,
  StoresPanel,
  TimelinePanel
} from "./CdpExplorePanels";

afterEach(cleanup);

const EXPOSURE = {
  deprecationYear: 2030,
  disallowedYear: 2035,
  total: 6735,
  uniqueTotal: 1032,
  devices: 53,
  vendor: 4687,
  foreign: 1895,
  own: 153,
  ownCa: 5,
  ownLeaf: 143,
  ownLeafDevices: 53,
  ownLeafBeyondDeprecation: 69,
  ownLeafBeyondDisallowed: 58,
  ownPostQuantum: 0,
  brokenToday: { weakKey: 491, weakSig: 477, expiredWithKey: 7, revoked: 1 },
  listeners: 61,
  listenerDevices: 27,
  devicesBlocked: 13,
  kemMeasured: false
};

describe("ExposureFunnel", () => {
  it("⭐ «Yours» lleva a la lista con clave privada; «still valid in 2030» añade la fecha", () => {
    const onSelect = vi.fn();
    render(<ExposureFunnel exposure={EXPOSURE} onSelect={onSelect} explain={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^Yours: 153$/ }));
    expect(onSelect).toHaveBeenLastCalledWith({ hasPrivateKey: true });
    fireEvent.click(screen.getByRole("button", { name: /Still valid in 2030: 69/ }));
    expect(onSelect).toHaveBeenLastCalledWith({ hasPrivateKey: true, notAfterFrom: "2030-01-01" });
  });

  it("lo roto HOY se separa de lo cuántico y navega a su flag", () => {
    const onSelect = vi.fn();
    render(<ExposureFunnel exposure={EXPOSURE} onSelect={onSelect} explain={false} />);
    fireEvent.click(screen.getByText(/491 weak keys/));
    expect(onSelect).toHaveBeenLastCalledWith({ flag: "weak_key" });
    fireEvent.click(screen.getByText(/7 expired with key/));
    expect(onSelect).toHaveBeenLastCalledWith({ status: "expired", hasPrivateKey: true });
  });

  it("⭐ no afirma nada sobre el KEM hasta que se mida", () => {
    render(<ExposureFunnel exposure={EXPOSURE} onSelect={() => {}} explain={false} />);
    expect(screen.getByText(/post-quantum key exchange not measured yet/i)).toBeInTheDocument();
  });

  it("el modo explicar añade las frases y el normal no", () => {
    const { rerender } = render(<ExposureFunnel exposure={EXPOSURE} onSelect={() => {}} explain={false} />);
    expect(screen.queryByText(/only the ones you hold a private key for/i)).not.toBeInTheDocument();
    rerender(<ExposureFunnel exposure={EXPOSURE} onSelect={() => {}} explain />);
    expect(screen.getByText(/only the ones you hold a private key for/i)).toBeInTheDocument();
  });

  it("⭐ fase 2: con KEM medido enseña híbridos, clásicos y los que no se supo, por separado", () => {
    render(
      <ExposureFunnel
        exposure={{ ...EXPOSURE, kemMeasured: true, kem: { endpoints: 61, probes: 4, hybrid: 0, classicalOnly: 57, unknown: 4, measured: 57 } }}
        onSelect={() => {}}
        explain={false}
      />
    );
    expect(screen.getByText(/0 negotiate post-quantum key exchange/)).toBeInTheDocument();
    expect(screen.getByText(/57 classical only/)).toBeInTheDocument();
    expect(screen.getByText(/4 could not be determined/)).toBeInTheDocument();
    expect(screen.queryByText(/not measured yet/i)).not.toBeInTheDocument();
  });

  it("bloqueados sin evaluar dice «not evaluated», no cero", () => {
    render(<ExposureFunnel exposure={{ ...EXPOSURE, devicesBlocked: null }} onSelect={() => {}} explain={false} />);
    expect(screen.getByText(/not evaluated/i)).toBeInTheDocument();
  });
});

describe("KeyDistributionPanel", () => {
  const FACETS = {
    by: ["key_algorithm", "key_size_bits"],
    stack: "ownership",
    rows: [
      { keys: { key_algorithm: "RSA", key_size_bits: 2048 }, stack: "own_leaf", certs: 143, uniqueCerts: 40, devices: 53, withPrivateKey: 143 },
      { keys: { key_algorithm: "RSA", key_size_bits: 2048 }, stack: "vendor", certs: 3000, uniqueCerts: 400, devices: 53, withPrivateKey: 0 },
      { keys: { key_algorithm: "RSA", key_size_bits: 512 }, stack: "vendor", certs: 53, uniqueCerts: 1, devices: 53, withPrivateKey: 0 }
    ]
  };

  it("⭐ un segmento «yours» navega con algoritmo, tamaño y clave privada", () => {
    const onSelect = vi.fn();
    render(<KeyDistributionPanel facets={FACETS} onSelect={onSelect} explain={false} />);
    fireEvent.click(screen.getByRole("button", { name: /RSA-2048 Yours \(private key\): 143/ }));
    expect(onSelect).toHaveBeenCalledWith({ keyAlgorithm: "RSA", keySizeBits: 2048, hasPrivateKey: true });
  });

  it("marca «weak today» lo que está roto sin ordenador cuántico", () => {
    render(<KeyDistributionPanel facets={FACETS} onSelect={() => {}} explain={false} />);
    expect(screen.getByText("weak today")).toBeInTheDocument();
    expect(screen.getByText("RSA-512")).toBeInTheDocument();
  });

  it("dice cuántos son tuyos por fila", () => {
    render(<KeyDistributionPanel facets={FACETS} onSelect={() => {}} explain={false} />);
    expect(screen.getByText(/^143 yours$/)).toBeInTheDocument();
  });
});

describe("StoresPanel", () => {
  const STORES = [
    { source: "java-store", scope: "system-roots", storeName: "/Library/Java/.../temurin-8.jdk/.../cacerts", certs: 292, uniqueCerts: 146, devices: 2, withPrivateKey: 0, expired: 0, vendorBundle: true, deviceList: [{ agentId: "a1", host: "SRV-01" }, { agentId: "a2", host: null }] },
    // Otro equipo a propósito: MUI Collapse deja el contenido en el DOM
    // aunque esté plegado, y el mismo host en dos almacenes daría dos
    // coincidencias — el test dejaría de medir la navegación.
    { source: "store", scope: "machine", storeName: "LocalMachine\\My", certs: 143, uniqueCerts: 40, devices: 53, withPrivateKey: 143, expired: 7, vendorBundle: false, deviceList: [{ agentId: "a3", host: "SRV-03" }] }
  ];

  it("⭐ avisa cuando los keystores Java son SOLO cacerts", () => {
    render(<StoresPanel stores={STORES} javaOnlyVendorBundles onSelect={() => {}} explain={false} />);
    expect(screen.getByText(/not inventoried/i)).toBeInTheDocument();
  });

  it("y no avisa cuando hay keystores de aplicación", () => {
    render(<StoresPanel stores={STORES} javaOnlyVendorBundles={false} onSelect={() => {}} explain={false} />);
    expect(screen.queryByText(/not inventoried/i)).not.toBeInTheDocument();
  });

  it("fuente → almacén → equipo, y cada nivel navega con su filtro", () => {
    const onSelect = vi.fn();
    render(<StoresPanel stores={STORES} javaOnlyVendorBundles={false} onSelect={onSelect} explain={false} />);
    fireEvent.click(screen.getByText("Java keystore"));
    expect(onSelect).toHaveBeenLastCalledWith({ source: "java-store" });

    fireEvent.click(screen.getByRole("button", { name: /Expand Java keystore/ }));
    fireEvent.click(screen.getByText(/temurin-8/));
    expect(onSelect).toHaveBeenLastCalledWith({ source: "java-store", storeName: STORES[0].storeName });

    fireEvent.click(screen.getByRole("button", { name: /Expand \/Library\/Java/ }));
    fireEvent.click(screen.getByText("SRV-01"));
    expect(onSelect).toHaveBeenLastCalledWith({ source: "java-store", storeName: STORES[0].storeName, agentId: "a1" });
    // Un equipo sin nombre enseña su id, no una fila vacía.
    expect(screen.getByText("a2")).toBeInTheDocument();
  });

  it("distingue el bundle del fabricante de lo que lleva clave", () => {
    render(<StoresPanel stores={STORES} javaOnlyVendorBundles onSelect={() => {}} explain={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Expand Java keystore/ }));
    fireEvent.click(screen.getByRole("button", { name: /Expand OS certificate store/ }));
    expect(screen.getByText("vendor bundle")).toBeInTheDocument();
    expect(screen.getByText("143 with key")).toBeInTheDocument();
  });
});

describe("TimelinePanel", () => {
  const TIMELINE = {
    fromYear: 2026,
    toYear: 2050,
    buckets: [
      { bucket: "expired", year: null, own_leaf: 7, own_ca: 0, vendor: 100, foreign: 20, total: 127 },
      { bucket: "2030", year: 2030, own_leaf: 69, own_ca: 0, vendor: 0, foreign: 0, total: 69 }
    ],
    references: [
      { date: "2027-01-01", year: 2027, label: "CNSA 2.0: obligatorio en producto nuevo", scope: "solo National Security Systems", source: "NSA CNSA 2.0" },
      { date: "2030-01-01", year: 2030, label: "RSA/ECDSA deprecados", scope: "borrador", source: "NIST IR 8547 (ipd)" }
    ]
  };

  it("cita las referencias con su alcance", () => {
    render(<TimelinePanel timeline={TIMELINE} onSelect={() => {}} explain={false} />);
    expect(screen.getByText(/2027: CNSA 2.0/)).toBeInTheDocument();
    expect(screen.getByText(/2030: RSA\/ECDSA deprecados/)).toBeInTheDocument();
  });

  it("la leyenda de propiedad está presente", () => {
    render(<TimelinePanel timeline={TIMELINE} onSelect={() => {}} explain={false} />);
    expect(screen.getByText("Yours (private key)")).toBeInTheDocument();
    expect(screen.getByText("Shipped with the OS / JVM")).toBeInTheDocument();
  });
});

describe("ExposureFunnel — fuera de los equipos (fase 4)", () => {
  it("⭐ enseña lo que existe sin agente como bloque aparte y lleva a Explore", () => {
    const onOpenOutside = vi.fn();
    const exposure = { ...EXPOSURE, outside: { assets: 230, certificates: 200, sources: 3, quantumBroken: 180, beyondDisallowed: 90, inUse: 12, bySource: [] } };
    render(<ExposureFunnel exposure={exposure} onSelect={() => {}} onOpenOutside={onOpenOutside} explain={false} />);
    const block = screen.getByRole("button", { name: /outside your devices/i });
    expect(block).toHaveTextContent(/200 certificate\(s\) in 3 source\(s\) without an agent/);
    expect(block).toHaveTextContent(/12 in use by a service/);
    expect(block).toHaveTextContent(/180 quantum-broken/);
    fireEvent.click(block);
    expect(onOpenOutside).toHaveBeenCalled();
    // Y no se suma a «Yours»: la cifra de equipos sigue siendo la de equipos.
    expect(screen.getByRole("button", { name: /^Yours: 153$/ })).toBeInTheDocument();
  });

  it("sin activos fuera (o tabla ausente) no pinta el bloque", () => {
    render(<ExposureFunnel exposure={{ ...EXPOSURE, outside: null }} onSelect={() => {}} explain={false} />);
    expect(screen.queryByText(/outside your devices/i)).not.toBeInTheDocument();
    render(<ExposureFunnel exposure={{ ...EXPOSURE, outside: { assets: 0, certificates: 0, sources: 0 } }} onSelect={() => {}} explain={false} />);
    expect(screen.queryByText(/outside your devices/i)).not.toBeInTheDocument();
  });
});
