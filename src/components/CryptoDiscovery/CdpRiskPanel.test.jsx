// src/components/CryptoDiscovery/CdpRiskPanel.test.jsx
//
// La pestaña Risk. Lo que se fija:
//   · ⭐ los factores de cada fila son los de la API (puntos, frase, referencia);
//   · ⭐ «How is this calculated?» enseña los pesos y umbrales QUE MANDA LA API
//     —con valores raros a propósito: si alguien los copiara en la UI, el
//     test lo cazaría—;
//   · ⭐ sin puntuar ≠ sin riesgo ≠ error (el de la lista y el del resumen);
//   · la banda vive en la URL y se manda como `minBand`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const getCdpRiskSummary = vi.fn();
const listCdpRiskTop = vi.fn();
vi.mock("../../api/cdp", () => ({
  getCdpRiskSummary: (...a) => getCdpRiskSummary(...a),
  listCdpRiskTop: (...a) => listCdpRiskTop(...a)
}));

import CdpRiskPanel from "./CdpRiskPanel";

// Pesos y umbrales que NO son los de risk.ts: la UI tiene que pintar éstos.
const WEIGHTS = { revoked: 37, expires7d: 23, cabfEach: 4, someFutureFactor: 9 };
const THRESHOLDS = [
  { band: "none", min: 0 },
  { band: "low", min: 1 },
  { band: "medium", min: 21 },
  { band: "high", min: 44 },
  { band: "critical", min: 81 }
];
const summary = (bands, extra = {}) => ({
  ok: true,
  bands: { critical: 0, high: 0, medium: 0, low: 0, none: 0, unscored: 0, ...bands },
  factors: [{ key: "revoked", certificates: 2 }],
  weights: WEIGHTS,
  bandThresholds: THRESHOLDS,
  ...extra
});
const ITEM = {
  fingerprint256: "ab".repeat(32),
  subjectCN: "intranet.example.com",
  issuerCN: "Example Issuing CA",
  notAfter: "2026-09-25T00:00:00Z",
  worstOn: { agentId: "agent-1", source: "listener" },
  occurrences: 3,
  riskScore: 85,
  riskBand: "critical",
  riskFactors: [
    { key: "revoked", points: 40, why: "Revoked by its issuer: it still looks valid to anything that does not check." },
    { key: "cabf_validity", points: 5, why: "Valid for 500 days; the maximum is 398.", reference: "CA/B Forum BR §6.3.2" }
  ]
};

beforeEach(() => {
  window.history.replaceState({}, "", "/?page=cdp&cdpTab=7");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("CdpRiskPanel · lista y factores", () => {
  it("⭐ cada fila se despliega y enseña sus factores tal cual llegan", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ critical: 1 }));
    listCdpRiskTop.mockResolvedValue({ ok: true, items: [ITEM] });
    const onOpen = vi.fn();
    render(<CdpRiskPanel refreshNonce={0} onOpenCertificate={onOpen} />);

    const row = await screen.findByTestId("risk-row");
    expect(within(row).getByText("intranet.example.com")).toBeInTheDocument();
    expect(within(row).getByText("Critical · 85")).toBeInTheDocument();
    // Plegada: aún sin desglose.
    expect(screen.queryByRole("table", { name: "Risk factors" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show factors for intranet.example.com" }));
    const table = await screen.findByRole("table", { name: "Risk factors" });
    expect(within(table).getByText("+40")).toBeInTheDocument();
    expect(within(table).getByText("+5")).toBeInTheDocument();
    expect(within(table).getByText(/Revoked by its issuer/)).toBeInTheDocument();
    expect(within(table).getByText("CA/B Forum BR §6.3.2")).toBeInTheDocument();
    expect(within(table).getByText("CA/B Forum: validity too long")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Details" }));
    expect(onOpen).toHaveBeenCalledWith(ITEM.fingerprint256);
  });

  it("⭐ «How is this calculated?» pinta los pesos y umbrales de la API, no unos propios", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ critical: 1 }));
    listCdpRiskTop.mockResolvedValue({ ok: true, items: [ITEM] });
    render(<CdpRiskPanel refreshNonce={0} />);

    fireEvent.click(await screen.findByRole("button", { name: /how is this calculated/i }));
    await screen.findByRole("table", { name: "Risk weights" });
    expect(screen.getByTestId("weight-revoked")).toHaveTextContent("37");
    expect(screen.getByTestId("weight-expires7d")).toHaveTextContent("23");
    expect(screen.getByTestId("weight-cabfEach")).toHaveTextContent("4");
    // Una clave que la UI no conoce se enseña igual, con nombre legible.
    expect(screen.getByText("Some future factor")).toBeInTheDocument();
    expect(screen.getByTestId("weight-someFutureFactor")).toHaveTextContent("9");
    // Umbrales derivados de los de la API.
    expect(screen.getByTestId("band-critical")).toHaveTextContent("81 or more");
    expect(screen.getByTestId("band-high")).toHaveTextContent("44–80");
    expect(screen.getByTestId("band-medium")).toHaveTextContent("21–43");
    expect(screen.getByTestId("band-low")).toHaveTextContent("1–20");
    expect(screen.getByTestId("band-none")).toHaveTextContent(/^0$/);
  });

  it("sin pesos en la respuesta no se inventan: se dice", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ critical: 1 }, { weights: undefined, bandThresholds: undefined }));
    listCdpRiskTop.mockResolvedValue({ ok: true, items: [ITEM] });
    render(<CdpRiskPanel refreshNonce={0} />);

    fireEvent.click(await screen.findByRole("button", { name: /how is this calculated/i }));
    expect(await screen.findByText(/did not send its weights/)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Risk weights" })).toBeNull();
  });

  it("⭐ un clic en una banda la pone en la URL y la pide como minBand", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ critical: 1, high: 4 }));
    listCdpRiskTop.mockResolvedValue({ ok: true, items: [ITEM] });
    render(<CdpRiskPanel refreshNonce={0} />);

    await screen.findByTestId("risk-row");
    expect(listCdpRiskTop).toHaveBeenLastCalledWith(expect.objectContaining({ minBand: undefined, certClass: "end-entity" }));

    fireEvent.click(screen.getByRole("button", { name: "High: 4 certificates" }));
    await waitFor(() => expect(listCdpRiskTop).toHaveBeenLastCalledWith(expect.objectContaining({ minBand: "high" })));
    expect(new URLSearchParams(window.location.search).get("rband")).toBe("high");
    expect(screen.getByText("Showing: High and above")).toBeInTheDocument();
  });

  it("llegando con la banda en la URL (desde el Dashboard) la pide de entrada", async () => {
    window.history.replaceState({}, "", "/?page=cdp&cdpTab=7&rband=critical");
    getCdpRiskSummary.mockResolvedValue(summary({ critical: 1 }));
    listCdpRiskTop.mockResolvedValue({ ok: true, items: [ITEM] });
    render(<CdpRiskPanel refreshNonce={0} />);

    await screen.findByTestId("risk-row");
    expect(listCdpRiskTop).toHaveBeenCalledWith(expect.objectContaining({ minBand: "critical" }));
  });
});

describe("CdpRiskPanel · ⭐ estados: sin puntuar, sin riesgo, error", () => {
  it("todo sin puntuar: aviso «not measured» y ninguna frase de «sin riesgo»", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ unscored: 784 }));
    listCdpRiskTop.mockResolvedValue({ ok: true, items: [] });
    render(<CdpRiskPanel refreshNonce={0} />);

    expect(await screen.findByText("Not scored yet")).toBeInTheDocument();
    expect(screen.getByText(/784 certificates have no score yet/)).toBeInTheDocument();
    await waitFor(() => expect(listCdpRiskTop).toHaveBeenCalled());
    expect(screen.queryByText(/carries a risk factor/)).toBeNull();
    expect(screen.queryByRole("list", { name: /by risk band/i })).toBeNull();
  });

  it("puntuado y limpio: «ninguno con factores», sin aviso de «no puntuado»", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ none: 40 }));
    listCdpRiskTop.mockResolvedValue({ ok: true, items: [] });
    render(<CdpRiskPanel refreshNonce={0} />);

    expect(await screen.findByText("No scored certificate carries a risk factor.")).toBeInTheDocument();
    expect(screen.queryByText("Not scored yet")).toBeNull();
  });

  it("con banda elegida y lista vacía: «nada en esta banda o por encima»", async () => {
    window.history.replaceState({}, "", "/?page=cdp&cdpTab=7&rband=critical");
    getCdpRiskSummary.mockResolvedValue(summary({ low: 3, none: 40 }));
    listCdpRiskTop.mockResolvedValue({ ok: true, items: [] });
    render(<CdpRiskPanel refreshNonce={0} />);

    expect(await screen.findByText("No certificates at critical risk or above.")).toBeInTheDocument();
  });

  it("⭐ la LISTA falla: error explícito, nunca «nada con riesgo»", async () => {
    getCdpRiskSummary.mockResolvedValue(summary({ critical: 2, none: 40 }));
    listCdpRiskTop.mockRejectedValue(new Error("HTTP 500: list down"));
    render(<CdpRiskPanel refreshNonce={0} />);

    expect(await screen.findByText("Couldn't load the list")).toBeInTheDocument();
    expect(screen.getByText(/list down/)).toBeInTheDocument();
    expect(screen.queryByText(/carries a risk factor/)).toBeNull();
    expect(screen.queryByText(/No certificates at/)).toBeNull();
    // El resumen sí cargó y sigue siendo cierto.
    expect(screen.getByRole("button", { name: "Critical: 2 certificates" })).toBeInTheDocument();
  });

  it("⭐ el RESUMEN falla: error explícito y la lista vacía no afirma nada sobre la flota", async () => {
    getCdpRiskSummary.mockRejectedValue(new Error("HTTP 500: summary down"));
    listCdpRiskTop.mockResolvedValue({ ok: true, items: [] });
    render(<CdpRiskPanel refreshNonce={0} />);

    expect(await screen.findByText("Couldn't load the band summary")).toBeInTheDocument();
    expect(await screen.findByText(/can't tell whether that means no risk or not scored yet/)).toBeInTheDocument();
    expect(screen.queryByText(/carries a risk factor/)).toBeNull();
    // Sin resumen no hay pesos: el «¿cómo se calcula?» no se ofrece con valores inventados.
    expect(screen.queryByRole("button", { name: /how is this calculated/i })).toBeNull();
  });
});
