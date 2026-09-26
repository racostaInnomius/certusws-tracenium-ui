// src/msp/PortfolioGrid.test.jsx
//
// ADR-0022, decisión «Vista MSP»: la tarjeta de un cliente enseña el PEOR
// score de sus instancias de servicio, y el backend lo sirve en
// `aspScoreMin` / `aspInstances` (columnas que el sweep escribía desde el
// 13-sep y que nadie leía).
//
// Lo que se fija aquí: que la quinta métrica aparece SÓLO con el plugin
// activo — un cliente sin Assessment Suite no debe enseñar un score vacío, y
// menos un 0, que se leería como la peor nota posible.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("./mspApi", () => ({ fetchMspClients: vi.fn().mockResolvedValue({ items: [] }) }));

import PortfolioGrid from "./PortfolioGrid";

afterEach(cleanup);

function item(over = {}) {
  return {
    tenantId: 111,
    name: "Mountainside",
    tenantType: "client",
    deviceCount: 107,
    onlineCount: 80,
    onlinePct: 75,
    openAlerts: 0,
    compliancePct: 88,
    aspScoreMin: 65,
    aspInstances: 1,
    updatedAt: null,
    ...over
  };
}

describe("PortfolioGrid — el score de Assessment Suite en la tarjeta", () => {
  it("⭐ con una instancia activa enseña su score", () => {
    render(<PortfolioGrid items={[item()]} onSelect={vi.fn()} />);
    expect(screen.getByText("Assessment: 65")).toBeTruthy();
  });

  it("⭐ con varias dice que es el PEOR, no una media", () => {
    render(<PortfolioGrid items={[item({ aspScoreMin: 42, aspInstances: 3 })]} onSelect={vi.fn()} />);
    expect(screen.getByText("Assessment (worst of 3): 42")).toBeTruthy();
  });

  it("⚠️ sin el plugin no hay quinta métrica (ni 0 ni raya)", () => {
    render(<PortfolioGrid items={[item({ aspScoreMin: null, aspInstances: 0 })]} onSelect={vi.fn()} />);
    expect(screen.queryByText(/Assessment/)).toBeNull();
    // Las otras cuatro siguen ahí.
    expect(screen.getByText("Compliance: 88.0%")).toBeTruthy();
  });

  it("activo pero todavía sin corrida completa: raya, no 0", () => {
    render(<PortfolioGrid items={[item({ aspScoreMin: null, aspInstances: 1 })]} onSelect={vi.fn()} />);
    expect(screen.getByText("Assessment: —")).toBeTruthy();
  });
});
