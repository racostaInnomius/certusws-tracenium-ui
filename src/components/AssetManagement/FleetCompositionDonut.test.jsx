// src/components/AssetManagement/FleetCompositionDonut.test.jsx
//
// La dona reparte un todo, y eso impone una regla que los tests fijan: lo que
// dibuja el anillo tiene que sumar la flota. Cifras del tenant 111.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FleetCompositionDonut from "./FleetCompositionDonut";

afterEach(cleanup);

const composition = { laptop: 26, desktop: 15, server: 11, unknown: 1, virtual: 11 };

function renderDonut(props = {}) {
  const onSelect = vi.fn();
  render(
    <FleetCompositionDonut
      composition={composition}
      total={53}
      activeFilter="all"
      onSelect={onSelect}
      {...props}
    />
  );
  return { onSelect };
}

describe("FleetCompositionDonut", () => {
  it("lleva el total al centro y las categorías a la leyenda", () => {
    renderDonut();
    expect(screen.getByText("53")).toBeTruthy();
    expect(screen.getByText(/Laptops 26/)).toBeTruthy();
    expect(screen.getByText(/Servers 11/)).toBeTruthy();
  });

  it("⚠️ los virtuales van al centro, NO al anillo", () => {
    // Son otro eje: en esta flota los 11 virtuales SON los 11 servidores, así
    // que como rebanada la dona sumaría 64 sobre 53 equipos.
    renderDonut();
    expect(screen.getByText("11 virtual")).toBeTruthy();
    // Cuatro arcos, uno por categoría — nunca cinco.
    expect(document.querySelectorAll("circle")).toHaveLength(4);
  });

  it("⚠️ los arcos suman la circunferencia completa", () => {
    // Si no sumaran, la dona tendría un hueco y afirmaría que faltan equipos
    // por clasificar cuando no faltan.
    renderDonut();
    const usado = Array.from(document.querySelectorAll("circle")).reduce(
      (acc, c) => acc + Number(String(c.getAttribute("stroke-dasharray")).split(" ")[0]),
      0
    );
    const circunferencia = 2 * Math.PI * 48;
    expect(usado).toBeCloseTo(circunferencia, 1);
  });

  it("cada rebanada y cada entrada de la leyenda filtran", () => {
    const { onSelect } = renderDonut();
    fireEvent.click(screen.getByText(/Desktops 15/));
    expect(onSelect).toHaveBeenCalledWith("desktop");

    fireEvent.click(screen.getByText("11 virtual"));
    expect(onSelect).toHaveBeenCalledWith("virtual");
  });

  it("una categoría en cero no dibuja un arco invisible", () => {
    renderDonut({ composition: { ...composition, unknown: 0 } });
    expect(document.querySelectorAll("circle")).toHaveLength(3);
    expect(screen.queryByText(/Unclassified/)).toBeNull();
  });

  it("sin flota lo dice en vez de dibujar un anillo vacío", () => {
    renderDonut({ composition: {}, total: 0 });
    expect(screen.getByText(/No devices to classify/i)).toBeTruthy();
  });

  it("no explota sin datos", () => {
    renderDonut({ composition: null, total: null });
    expect(screen.getByText(/No devices to classify/i)).toBeTruthy();
  });
});
