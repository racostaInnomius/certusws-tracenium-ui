// src/components/Assets/SignalCoverageCard.test.jsx
//
// La tarjeta de puntos ciegos. Lo que se fija aquí es lo que separa una cifra
// útil de una alarma que se aprende a ignorar:
//
//   · lo NO contratado se etiqueta y no cuenta como ceguera;
//   · "nunca reportó" y "lleva semanas callado" se dicen por separado: uno es
//     un equipo que nunca se configuró y el otro, uno que se rompió;
//   · el titular sale del backend deduplicado, no de sumar las señales.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../../api/dashboard", () => ({ dashboardApi: { getSignalCoverage: vi.fn() } }));

import { dashboardApi } from "../../api/dashboard";
import SignalCoverageCard, { gapText, barColor } from "./SignalCoverageCard";

const signal = (over = {}) => ({
  key: "compliance",
  label: "Compliance posture",
  plugin: "scp",
  entitled: true,
  staleAfterDays: 3,
  reporting: 40,
  stale: 5,
  never: 37,
  blind: 42,
  blindPct: 51.2,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  dashboardApi.getSignalCoverage.mockResolvedValue({
    fleet: 82,
    devicesWithAnyGap: 45,
    signals: [signal()],
  });
});
afterEach(cleanup);

describe("el texto del hueco", () => {
  it("separa lo que nunca reportó de lo que lleva demasiado callado", () => {
    expect(gapText(signal())).toBe("37 never reported · 5 silent for over 3 days");
    expect(gapText(signal({ never: 0, blind: 5 }))).toBe("5 silent for over 3 days");
    expect(gapText(signal({ stale: 0, blind: 37 }))).toBe("37 never reported");
  });

  it("sin plan no dice hueco: dice que no se espera nada", () => {
    expect(gapText(signal({ entitled: false }))).toMatch(/not in plan/i);
  });

  it("todo reportando se dice, en vez de dejar el hueco en blanco", () => {
    expect(gapText(signal({ blind: 0, never: 0, stale: 0 }))).toMatch(/every device is reporting/i);
  });
});

describe("el color", () => {
  it("verde sólo cuando no hay ceguera; sin plan no se pinta de éxito", () => {
    expect(barColor(signal({ blind: 0, blindPct: 0 }))).toBe("success");
    expect(barColor(signal({ blindPct: 3 }))).toBe("warning");
    expect(barColor(signal({ blindPct: 51.2 }))).toBe("error");
    expect(barColor(signal({ entitled: false, blindPct: 0 }))).not.toBe("success");
  });
});

describe("la tarjeta", () => {
  it("abre con el titular: cuántos equipos del parque tienen algún hueco", async () => {
    render(<SignalCoverageCard />);
    expect(await screen.findByText("Blind spots")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText(/missing at\s+least one signal/i)).toBeInTheDocument();
  });

  it("una señal sin plan se marca y no se pinta como cobertura completa", async () => {
    dashboardApi.getSignalCoverage.mockResolvedValue({
      fleet: 82,
      devicesWithAnyGap: 0,
      signals: [signal({ key: "patches", label: "Missing patches", plugin: "pmp", entitled: false, reporting: 0, stale: 0, never: 82, blind: 0, blindPct: 0 })],
    });
    render(<SignalCoverageCard />);
    expect(await screen.findByText("not in plan")).toBeInTheDocument();
    expect(screen.getByText(/nothing is expected/i)).toBeInTheDocument();
  });

  it("un parque vacío lo dice, en vez de enseñar barras al 0%", async () => {
    dashboardApi.getSignalCoverage.mockResolvedValue({ fleet: 0, devicesWithAnyGap: 0, signals: [] });
    render(<SignalCoverageCard />);
    expect(await screen.findByText(/no managed devices yet/i)).toBeInTheDocument();
  });

  it("un error de carga se enseña", async () => {
    dashboardApi.getSignalCoverage.mockRejectedValue(new Error("boom"));
    render(<SignalCoverageCard />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
