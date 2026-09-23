// ADR-0012 (addendum) — el panel de cambios de directiva.
//
// ⚠️ Lo que vigilan estos tests:
//   1. Que la directiva que SALE se cuente igual que la que entra.
//   2. Que «ningún cambio» no se lea como «el dominio no se tocó».
//   3. Que el recuento se declare como un suelo cuando hay equipos con una
//      sola lectura.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GpoChangesView } from "./GpoChangesPanel";

afterEach(cleanup);

const grupo = (over = {}) => ({
  gpo: "ADC-SecurityFix",
  direction: "added",
  day: "2026-09-22",
  devices: [
    { agentId: "a-1", hostname: "Castico-PV", at: "2026-09-22T20:27:00.000Z" },
    { agentId: "a-2", hostname: "DESKTOP-4FTSTH1", at: "2026-09-22T18:51:00.000Z" },
  ],
  firstAt: "2026-09-22T18:51:00.000Z",
  lastAt: "2026-09-22T20:27:00.000Z",
  ...over,
});

describe("GpoChangesView", () => {
  it("⭐ el caso de T111: una directiva que entra en varios equipos esa tarde", () => {
    render(<GpoChangesView data={{ groups: [grupo()], devicesWithSingleReading: 0 }} />);
    expect(screen.getByText("ADC-SecurityFix")).toBeInTheDocument();
    expect(screen.getByText("Started applying")).toBeInTheDocument();
    expect(screen.getByText(/2 devices: Castico-PV, DESKTOP-4FTSTH1/)).toBeInTheDocument();
  });

  it("⭐ la que SALE se cuenta igual: suele ser un filtro que dejó de cumplirse", () => {
    render(<GpoChangesView data={{ groups: [grupo({ direction: "removed" })], devicesWithSingleReading: 0 }} />);
    expect(screen.getByText("Stopped applying")).toBeInTheDocument();
  });

  it("⚠️ sin cambios NO se dice que el dominio no se tocó", () => {
    render(<GpoChangesView data={{ groups: [], devicesWithSingleReading: 0 }} />);
    expect(screen.getByText(/No policy changes seen in this period/i)).toBeInTheDocument();
    expect(screen.getByText(/not that the domain was untouched/i)).toBeInTheDocument();
  });

  it("⚠️ el recuento se declara como un suelo si hay equipos con una sola lectura", () => {
    render(<GpoChangesView data={{ groups: [grupo()], devicesWithSingleReading: 2 }} />);
    expect(screen.getByText(/2 devices have a single reading/i)).toBeInTheDocument();
    expect(screen.getByText(/did not “gain” the policies of its first scan/i)).toBeInTheDocument();
  });

  it("sin equipos de una sola lectura no se añade ruido", () => {
    render(<GpoChangesView data={{ groups: [grupo()], devicesWithSingleReading: 0 }} />);
    expect(screen.queryByText(/single reading/i)).not.toBeInTheDocument();
  });

  it("pinchar en el nombre de la directiva la enfoca arriba", () => {
    const onPickGpo = vi.fn();
    render(<GpoChangesView data={{ groups: [grupo()], devicesWithSingleReading: 0 }} onPickGpo={onPickGpo} />);
    fireEvent.click(screen.getByText("ADC-SecurityFix"));
    expect(onPickGpo).toHaveBeenCalledWith("ADC-SecurityFix");
  });

  it("un error no se presenta como «no hubo cambios»", () => {
    render(<GpoChangesView error="boom" />);
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.queryByText(/No policy changes/i)).not.toBeInTheDocument();
  });
});
