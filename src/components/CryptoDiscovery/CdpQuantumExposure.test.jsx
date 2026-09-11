// src/components/CryptoDiscovery/CdpQuantumExposure.test.jsx
//
// La tira de preparación y el sunburst del Dashboard: los números salen de
// exposure/overview, cada par navega, el «Group by» cambia la petición y
// un gajo abre Inventory con el filtro de ese gajo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getCdpFacets = vi.fn();
const getCdpRoadmap = vi.fn();
vi.mock("../../api/cdp", () => ({ getCdpFacets: (...a) => getCdpFacets(...a), getCdpRoadmap: (...a) => getCdpRoadmap(...a) }));

import { ReadinessStrip, QuantumSunburst } from "./CdpQuantumExposure";

const EXPOSURE = { total: 1043, own: 151, ownPostQuantum: 0, devicesBlocked: 20, kem: { hybrid: 20, classicalOnly: 44, unknown: 0, endpoints: 64, probes: 0 }, outside: { bySource: [{ sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs", certificates: 27 }] } };
const OVERVIEW = { roadmap: { systemsTotal: 34, systemsPlanned: 0, devicesBlocked: 20 }, orphanKeys: { total: 0, stale: 0 } };

beforeEach(() => {
  getCdpFacets.mockImplementation(async ({ by, hasPrivateKey }) =>
    hasPrivateKey
      ? { rows: [{ keys: { source: "store", store_name: "LocalMachine\\My", key_algorithm: "RSA" }, stack: 2048, certs: 146, uniqueCerts: 146, devices: 54 }] }
      : { rows: [{ keys: { ownership: "own_leaf", source: "store", key_algorithm: "RSA" }, stack: 2048, certs: 146, uniqueCerts: 146, devices: 54 }, { keys: { ownership: "vendor", source: "store", key_algorithm: "RSA" }, stack: 4096, certs: 51, uniqueCerts: 51, devices: 54 }] }
  );
  getCdpRoadmap.mockResolvedValue({ ok: true, systems: [{ key: "process:svchost.exe", name: "Served by svchost.exe", factors: { kemHybrid: 14, kemClassical: 4, kemUnknown: 0 } }] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReadinessStrip", () => {
  it("⭐ el porcentaje sale de propios post-cuánticos + servicios híbridos sobre propios + servicios medidos, y lo dice", () => {
    render(<ReadinessStrip exposure={EXPOSURE} overview={OVERVIEW} devicesReporting={54} />);
    // (0 + 20) / (151 + 64) = 9 %
    expect(screen.getByLabelText("Post-quantum readiness")).toHaveTextContent("9%");
    expect(screen.getByText(/0 of 151 certificates you own are post-quantum · 20 of 64 TLS services/)).toBeInTheDocument();
    expect(screen.getByText("Quantum-broken certificates you own").parentElement).toHaveTextContent("151/ 151");
    expect(screen.getByText("Services on classical key exchange").parentElement).toHaveTextContent("44/ 64");
    expect(screen.getByText("Systems without a wave").parentElement).toHaveTextContent("34/ 34");
    expect(screen.getByText("Devices that cannot migrate yet").parentElement).toHaveTextContent("20/ 54");
  });

  it("cada par navega: propios → clave privada, clásicos → kem=classical, sistemas y bloqueados → Roadmap", () => {
    const onDrillDown = vi.fn();
    const onOpenRoadmap = vi.fn();
    render(<ReadinessStrip exposure={EXPOSURE} overview={OVERVIEW} devicesReporting={54} onDrillDown={onDrillDown} onOpenRoadmap={onOpenRoadmap} />);
    fireEvent.click(screen.getByText("Quantum-broken certificates you own"));
    expect(onDrillDown).toHaveBeenLastCalledWith({ hasPrivateKey: true }, { replace: true });
    fireEvent.click(screen.getByText("Services on classical key exchange"));
    expect(onDrillDown).toHaveBeenLastCalledWith({ kem: "classical" }, { replace: true });
    fireEvent.click(screen.getByText("Systems without a wave"));
    fireEvent.click(screen.getByText("Devices that cannot migrate yet"));
    expect(onOpenRoadmap).toHaveBeenCalledTimes(2);
  });

  it("sin nada medido no inventa un 0 %", () => {
    render(<ReadinessStrip exposure={{ own: 0, ownPostQuantum: 0, kem: { hybrid: 0, classicalOnly: 0 } }} overview={null} devicesReporting={0} />);
    expect(screen.getByLabelText("Post-quantum readiness")).toHaveTextContent("—");
  });
});

describe("QuantumSunburst", () => {
  it("⭐ abre en Keys, pide las facetas de claves, y pinta las cuatro bases aunque tres estén vacías", async () => {
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onDrillDown={vi.fn()} />);
    await waitFor(() => expect(getCdpFacets).toHaveBeenCalledWith(expect.objectContaining({ by: ["source", "store_name", "key_algorithm"], stack: "key_size_bits", hasPrivateKey: true })));
    expect(await screen.findByText("146")).toBeInTheDocument();
    expect(screen.getByText("private keys")).toBeInTheDocument();
    for (const base of ["On-prem", "Infra", "Cloud", "External key sources"]) expect(screen.getByText(base)).toBeInTheDocument();
  });

  it("«Certificates» pide facetas por propiedad, fuente y algoritmo y suma lo de fuera en el centro; «Services / Resources» pide el roadmap", async () => {
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onDrillDown={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Certificates"));
    await waitFor(() => expect(getCdpFacets).toHaveBeenCalledWith(expect.objectContaining({ by: ["ownership", "source", "key_algorithm"], stack: "key_size_bits" })));
    // 1,043 únicos en equipos + 27 de la CA.
    expect(await screen.findByText("1,070")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Services / Resources"));
    await waitFor(() => expect(getCdpRoadmap).toHaveBeenCalled());
    expect(await screen.findByText("18")).toBeInTheDocument();
    expect(screen.getByText("services and resources")).toBeInTheDocument();
  });

  it("⭐ un gajo de algoritmo abre Inventory con su filtro; una base vacía no navega", async () => {
    const onDrillDown = vi.fn();
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onDrillDown={onDrillDown} />);
    const arc = await screen.findByRole("button", { name: /RSA-2048: 146 private keys/ });
    fireEvent.click(arc);
    expect(onDrillDown).toHaveBeenCalledWith(expect.objectContaining({ hasPrivateKey: true, keyAlgorithm: "RSA", keySizeBits: 2048, storeName: "LocalMachine\\My" }), { replace: true });
    expect(screen.queryByRole("button", { name: /^Cloud/ })).not.toBeInTheDocument();
  });

  it("un fallo al cargar se dice, no se calla", async () => {
    getCdpFacets.mockRejectedValueOnce(new Error("backend caído"));
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onDrillDown={vi.fn()} />);
    expect(await screen.findByText("backend caído")).toBeInTheDocument();
  });
});
