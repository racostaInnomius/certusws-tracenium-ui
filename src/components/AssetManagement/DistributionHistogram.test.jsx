// src/components/AssetManagement/DistributionHistogram.test.jsx
//
// La distribución de la flota en cubos. Los números son los del tenant 111
// (medido 2026-08-31): 34 / 7 / 6 / 5 / 0 en disco, con 1 equipo sin medir.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DistributionHistogram from "./DistributionHistogram";

afterEach(cleanup);

const disk = [
  { key: "disk_0_49", label: "0–49%", count: 34, alarming: false },
  { key: "disk_50_69", label: "50–69%", count: 7, alarming: false },
  { key: "disk_70_84", label: "70–84%", count: 6, alarming: false },
  { key: "disk_85_94", label: "85–94%", count: 5, alarming: true },
  { key: "disk_95_100", label: "95–100%", count: 0, alarming: true },
];

function renderChart(props = {}) {
  const onSelect = vi.fn();
  render(
    <DistributionHistogram
      title="Disk usage"
      buckets={disk}
      activeFilter="all"
      onSelect={onSelect}
      {...props}
    />
  );
  return { onSelect };
}

describe("DistributionHistogram", () => {
  it("dibuja todos los cubos con su conteo y su etiqueta", () => {
    renderChart();
    for (const b of disk) {
      expect(screen.getByText(b.label)).toBeTruthy();
    }
    expect(screen.getByText("34")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("⚠️ un cubo vacío se dibuja igual, con su cero", () => {
    // Saltárselo rompería el eje: la distribución dejaría de leerse como una
    // forma y pasaría a ser una lista de las categorías que hoy tienen gente.
    renderChart();
    expect(screen.getByText("95–100%")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("dice cuántos equipos midió, que no es lo mismo que cuántos hay", () => {
    renderChart();
    expect(screen.getByText("52 measured")).toBeTruthy();
  });

  it("cada columna filtra su propio rango", () => {
    const { onSelect } = renderChart();
    fireEvent.click(screen.getByText("70–84%"));
    expect(onSelect).toHaveBeenCalledWith("disk_70_84");
  });

  it("también con teclado", () => {
    const { onSelect } = renderChart();
    const columnas = screen.getAllByRole("button");
    fireEvent.keyDown(columnas[0], { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("disk_0_49");
  });

  it("marca la columna activa para lectores de pantalla", () => {
    renderChart({ activeFilter: "disk_85_94" });
    const activas = screen
      .getAllByRole("button")
      .filter((el) => el.getAttribute("aria-pressed") === "true");
    expect(activas).toHaveLength(1);
    expect(activas[0].getAttribute("aria-label")).toMatch(/85–94%/);
  });

  it("⚠️ los equipos sin medir se dicen, no se callan", () => {
    // Un equipo que no reporta disco no cae en ningún cubo. Si además no
    // apareciera al pie, la suma de las columnas se leería como la flota
    // entera y ese equipo sería invisible.
    const { onSelect } = renderChart({
      footnote: "1 device not reporting disk",
      onFootnoteClick: vi.fn(),
    });
    const pie = screen.getByText("1 device not reporting disk");
    expect(pie).toBeTruthy();
    fireEvent.click(pie);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("sin equipos sin medir no inventa la nota al pie", () => {
    renderChart({ footnote: null });
    expect(screen.queryByText(/not reporting/i)).toBeNull();
  });

  it("una flota sin datos lo dice en vez de dibujar columnas vacías", () => {
    renderChart({
      buckets: disk.map((b) => ({ ...b, count: 0 })),
      emptyLabel: "No disk usage data",
    });
    expect(screen.getByText("No disk usage data")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("no explota sin cubos", () => {
    renderChart({ buckets: null, emptyLabel: "No data" });
    expect(screen.getByText("No data")).toBeTruthy();
  });
});
