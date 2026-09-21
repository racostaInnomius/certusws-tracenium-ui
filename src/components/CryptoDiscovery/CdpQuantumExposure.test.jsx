// src/components/CryptoDiscovery/CdpQuantumExposure.test.jsx
//
// La tira de preparación y el sunburst del Dashboard: los números salen de
// exposure/overview, cada par navega, el «Group by» cambia la petición y
// cada gajo abre la pantalla donde viven SUS filas —Inventory o Explore—
// y una base amplía el sector en vez de prometer una lista que no existe.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getCdpFacets = vi.fn();
const getCdpRoadmap = vi.fn();
vi.mock("../../api/cdp", () => ({ getCdpFacets: (...a) => getCdpFacets(...a), getCdpRoadmap: (...a) => getCdpRoadmap(...a) }));

import { ReadinessStrip, QuantumSunburst, CoverageGapLine } from "./CdpQuantumExposure";

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
  it("⭐ ADR-0024: bajo «cannot migrate yet» dice cuántos más pueden migrar con un ajuste, y no lo suma al bloqueo", () => {
    render(<ReadinessStrip exposure={{ ...EXPOSURE, devicesFixable: 29 }} overview={OVERVIEW} devicesReporting={54} />);
    expect(screen.getByText("+ 29 can migrate with a fix")).toBeInTheDocument();
    // El par sigue siendo 20 bloqueados / 54.
    expect(screen.getByText("Devices that cannot migrate yet").parentElement).toHaveTextContent("20/ 54");
  });

  it("sin el dato (backend anterior) o a cero no se pinta: null no es «ninguno»", () => {
    render(<ReadinessStrip exposure={EXPOSURE} overview={OVERVIEW} devicesReporting={54} />);
    expect(screen.queryByText(/can migrate with a fix/)).not.toBeInTheDocument();
    cleanup();
    render(<ReadinessStrip exposure={{ ...EXPOSURE, devicesFixable: 0 }} overview={OVERVIEW} devicesReporting={54} />);
    expect(screen.queryByText(/can migrate with a fix/)).not.toBeInTheDocument();
  });

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
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onSelect={vi.fn()} />);
    await waitFor(() => expect(getCdpFacets).toHaveBeenCalledWith(expect.objectContaining({ by: ["source", "store_name", "key_algorithm"], stack: "key_size_bits", hasPrivateKey: true })));
    // 146 claves en los equipos + 27 que certificó la CA (grupo de Infra).
    expect(await screen.findByText("173")).toBeInTheDocument();
    expect(screen.getByText("private keys")).toBeInTheDocument();
    for (const base of ["On-prem devices", "Infra", "Cloud", "External key sources"]) expect(screen.getByText(base)).toBeInTheDocument();
    expect(screen.queryByText("Windows CA")).not.toBeInTheDocument();
  });

  it("«Certificates» pide facetas por propiedad, fuente y algoritmo y suma lo de fuera en el centro; «Services / Resources» pide el roadmap", async () => {
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onSelect={vi.fn()} />);
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
    const onSelect = vi.fn();
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onSelect={onSelect} />);
    const arc = await screen.findByRole("button", { name: /RSA-2048: 146 private keys/ });
    fireEvent.click(arc);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ to: "inventory", hasPrivateKey: true, keyAlgorithm: "RSA", keySizeBits: 2048, storeName: "LocalMachine\\My" }));
    expect(screen.queryByRole("button", { name: /^Cloud/ })).not.toBeInTheDocument();
  });

  it("⭐ lo que vive fuera de los equipos NO va a Inventory: el gajo de la CA abre Explore por su origen", async () => {
    const onSelect = vi.fn();
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onSelect={onSelect} />);
    const ca = await screen.findByRole("button", { name: /CA · MSIG-RADIUS-CA: 27 private keys/ });
    expect(ca).toHaveAccessibleName(/open in Explore/i);
    fireEvent.click(ca);
    expect(onSelect).toHaveBeenCalledWith({ to: "outside", sourceName: "adcs:MSIG-RADIUS-CA", origin: "adcs" });
  });

  it("⭐ una base no navega: amplía su sector y se puede volver", async () => {
    const onSelect = vi.fn();
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onSelect={onSelect} />);
    const onprem = await screen.findByRole("button", { name: /On-prem devices: 146 private keys — click to zoom/ });
    fireEvent.click(onprem);
    // Ninguna navegación: el sector se abre, y las otras bases se quitan.
    expect(onSelect).not.toHaveBeenCalled();
    expect(await screen.findByText("Showing On-prem devices only")).toBeInTheDocument();
    expect(screen.queryByText("External key sources")).not.toBeInTheDocument();
    // Y sus fuentes siguen navegando desde dentro.
    fireEvent.click(screen.getByRole("button", { name: /LocalMachine/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ to: "inventory", storeName: "LocalMachine\\My" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to all bases" }));
    expect(await screen.findByText("External key sources")).toBeInTheDocument();
  });

  it("en Keys y Certificates se explica dónde está el verde de la tira; en Services no hace falta", async () => {
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onSelect={vi.fn()} />);
    expect(await screen.findByText(/hybrid key exchange counted in the readiness figure/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Services / Resources"));
    await waitFor(() => expect(screen.queryByText(/hybrid key exchange counted in the readiness figure/)).not.toBeInTheDocument());
  });

  it("un fallo al cargar se dice, no se calla", async () => {
    getCdpFacets.mockRejectedValueOnce(new Error("backend caído"));
    render(<QuantumSunburst exposure={EXPOSURE} overview={OVERVIEW} onSelect={vi.fn()} />);
    expect(await screen.findByText("backend caído")).toBeInTheDocument();
  });
});

describe("⭐ ADR-0026 · la tira dice sobre QUÉ se calculó", () => {
  it("con activos fuera de los equipos, dice que no están en la cifra", () => {
    render(<ReadinessStrip exposure={{ ...EXPOSURE, outside: { certificates: 812, sources: 4 } }} overview={OVERVIEW} devicesReporting={54} />);
    expect(screen.getByText("Measured on 54 devices with an agent. The 812 certificates found outside your devices are not in this figure.")).toBeInTheDocument();
  });

  it("⭐ sin nada conectado fuera, lo dice: la cifra sólo cubre lo que ven los agentes (y por eso sale optimista)", () => {
    render(<ReadinessStrip exposure={{ ...EXPOSURE, outside: { certificates: 0, sources: 0 } }} overview={OVERVIEW} devicesReporting={1} />);
    expect(screen.getByText(/Measured on 1 device with an agent\. Nothing outside your devices is connected/)).toBeInTheDocument();
  });

  it("sin saber cuántos equipos reportan no se inventa la base", () => {
    render(<ReadinessStrip exposure={EXPOSURE} overview={OVERVIEW} devicesReporting={null} />);
    expect(screen.queryByText(/Measured on/)).toBeNull();
  });
});

describe("⭐ ADR-0026 · el número del agujero", () => {
  const NOW = Date.parse("2026-09-21T12:00:00Z");

  it("con los números de T111 del 21-sep: 27 vigentes, 17 a la vista — y dice dónde están los otros 10 sin acusar", () => {
    render(<CoverageGapLine gap={{ caIssued: 27, caOnDevices: 17, caLastRead: "2026-09-21T06:00:00Z", devicesWithAgent: 56 }} now={NOW} />);
    const line = screen.getByLabelText("Coverage gap");
    expect(line).toHaveTextContent("Your Windows CA issued 27 certificates that are still valid. Tracenium knows where 17 of them are — on the 56 devices with an agent.");
    expect(line).toHaveTextContent("The other 10 are on machines without an agent");
    // No acusa: «sin agente», no «perdidos» ni «desconocidos».
    expect(line).not.toHaveTextContent(/lost|unknown|rogue/i);
    // Lectura reciente: sin aviso de fecha.
    expect(screen.queryByText(/As last read from the CA/)).toBeNull();
  });

  it("⭐ si la lectura de la CA es vieja (congelada o su lector paró), dice de cuándo es la foto", () => {
    render(<CoverageGapLine gap={{ caIssued: 27, caOnDevices: 17, caLastRead: "2026-09-08T15:24:17Z", devicesWithAgent: 56 }} now={NOW} />);
    expect(screen.getByText(/As last read from the CA on/)).toBeInTheDocument();
  });

  it("sin CA leída no se pinta: una frase con ceros no dice nada", () => {
    const { container } = render(<CoverageGapLine gap={{ caIssued: 0, caOnDevices: 0, caLastRead: null, devicesWithAgent: 19 }} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<CoverageGapLine gap={null} now={NOW} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it("si todo está a la vista, lo dice en vez de inventar un agujero", () => {
    render(<CoverageGapLine gap={{ caIssued: 5, caOnDevices: 5, caLastRead: "2026-09-21T06:00:00Z", devicesWithAgent: 4 }} now={NOW} />);
    expect(screen.getByLabelText("Coverage gap")).toHaveTextContent("Every one of them is on a device you can see.");
  });
});
