// src/components/patch-management/MissingBySeverityChart.test.jsx

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import MissingBySeverityChart from "./MissingBySeverityChart";

afterEach(cleanup);

const T111 = { critical: 37, important: 121, moderate: 44, low: 12 };

describe("MissingBySeverityChart", () => {
  it("dice el total de parches y de qué severidad son", () => {
    render(<MissingBySeverityChart severityBreakdown={T111} />);
    expect(screen.getByText("214")).toBeInTheDocument();
    expect(screen.getByText(/patches waiting across the fleet/)).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("121")).toBeInTheDocument();
  });

  it("⚠️ el número va escrito en cada banda: el color no es la única señal", () => {
    render(<MissingBySeverityChart severityBreakdown={T111} />);
    for (const value of ["37", "121", "44", "12"]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it("⚠️ no ofrece filtrar: ninguna banda es un botón", () => {
    // La fila de equipo solo trae critical+important, así que filtrar por
    // «moderate» no se puede cumplir. Una barra pulsable que no hace nada sería
    // peor que ninguna.
    render(<MissingBySeverityChart severityBreakdown={T111} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("sin parches pendientes lo dice, en vez de pintar barras vacías", () => {
    render(<MissingBySeverityChart severityBreakdown={{}} />);
    expect(screen.getByText(/No device is reporting a missing OS patch/)).toBeInTheDocument();
  });

  it("⭐ la cabecera es el mismo bloque que «Start here» y el donut", () => {
    // De eso depende que los tres paneles empiecen a la misma altura.
    render(<MissingBySeverityChart severityBreakdown={T111} />);
    expect(screen.getByText("Pending work")).toBeInTheDocument();
    expect(screen.getByText("Missing OS patches by severity")).toBeInTheDocument();
  });
});
