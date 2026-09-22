// src/components/CryptoDiscovery/CdpRiskStrip.test.jsx
//
// La tira de riesgo del Dashboard. Lo que se fija:
//   · las cifras por banda son las de la API y un clic abre ESA banda;
//   · «none» y «unscored» no son botones (no hay lista que abrir);
//   · ⭐ error ≠ vacío ≠ sin puntuar ≠ sin riesgo: cuatro frases distintas,
//     y un fallo de la API NUNCA se pinta como un cero.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const getCdpRiskSummary = vi.fn();
vi.mock("../../api/cdp", () => ({ getCdpRiskSummary: (...a) => getCdpRiskSummary(...a) }));

import CdpRiskStrip from "./CdpRiskStrip";
import { riskSummaryState } from "./cdpRisk";

const summary = (bands) => ({ ok: true, bands: { critical: 0, high: 0, medium: 0, low: 0, none: 0, unscored: 0, ...bands }, factors: [], weights: {}, bandThresholds: [] });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CdpRiskStrip", () => {
  it("⭐ pinta la cifra de cada banda que manda la API", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ critical: 3, high: 12, medium: 40, low: 7, none: 500 }));
    render(<CdpRiskStrip refreshNonce={0} onOpenBand={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Critical: 3 certificates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "High: 12 certificates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Medium: 40 certificates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Low: 7 certificates" })).toBeInTheDocument();
    // «No risk» se ve pero no es un botón: la lista sólo tiene cifra ≥ 1.
    expect(screen.getByLabelText("No risk: 500 certificates")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /No risk/ })).toBeNull();
  });

  it("⭐ un clic en una banda la abre", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ high: 12 }));
    const onOpenBand = vi.fn();
    render(<CdpRiskStrip refreshNonce={0} onOpenBand={onOpenBand} />);

    fireEvent.click(await screen.findByRole("button", { name: "High: 12 certificates" }));
    expect(onOpenBand).toHaveBeenCalledWith("high");

    fireEvent.click(screen.getByRole("button", { name: /open risk list/i }));
    expect(onOpenBand).toHaveBeenLastCalledWith(null);
  });

  it("⭐ error de la API: lo dice y no pinta ninguna cifra (no es «sin riesgo»)", async () => {
    getCdpRiskSummary.mockRejectedValue(new Error("HTTP 500: boom"));
    render(<CdpRiskStrip refreshNonce={0} />);

    expect(await screen.findByText(/Couldn't load risk scores: HTTP 500: boom/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /by risk band/i })).toBeNull();
    expect(screen.queryByText(/No scored certificate carries a risk factor/)).toBeNull();
    expect(screen.queryByText(/Not scored yet/)).toBeNull();
  });

  it("⭐ todo sin puntuar: «not measured», no una fila de ceros", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ unscored: 784 }));
    render(<CdpRiskStrip refreshNonce={0} />);

    expect(await screen.findByText(/Not scored yet: 784 certificates are waiting/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /by risk band/i })).toBeNull();
    expect(screen.queryByText(/carries a risk factor/)).toBeNull();
  });

  it("puntuado y limpio: lo dice, y las bandas en cero siguen a la vista", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ none: 20 }));
    render(<CdpRiskStrip refreshNonce={0} />);

    expect(await screen.findByText(/No scored certificate carries a risk factor/)).toBeInTheDocument();
    expect(screen.getByLabelText("No risk: 20 certificates")).toBeInTheDocument();
  });

  it("parcialmente puntuado: la casilla «Not scored» aparece y se explica", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ high: 1, none: 5, unscored: 2 }));
    render(<CdpRiskStrip refreshNonce={0} />);

    expect(await screen.findByLabelText("Not scored: 2 certificates")).toBeInTheDocument();
    expect(screen.getByText(/2 not scored yet/)).toBeInTheDocument();
  });

  it("sin certificados: no inventa bandas", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({}));
    render(<CdpRiskStrip refreshNonce={0} />);

    expect(await screen.findByText(/No end-entity certificates reported yet/)).toBeInTheDocument();
  });
});

describe("riskSummaryState", () => {
  it("separa vacío, sin puntuar, limpio y con riesgo", () => {
    expect(riskSummaryState(null).state).toBe("empty");
    expect(riskSummaryState({ bands: { unscored: 3 } }).state).toBe("unscored");
    expect(riskSummaryState({ bands: { none: 3, unscored: 1 } }).state).toBe("clean");
    expect(riskSummaryState({ bands: { low: 1, none: 3 } })).toMatchObject({ state: "scored", total: 4, atRisk: 1 });
  });
});
