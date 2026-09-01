// src/components/AssetManagement/FleetOverviewCards.test.jsx
//
// La fila que encabeza Hardware Inventory. Lo que se fija aquí no es el
// maquetado sino las tres decisiones que la hacen distinta de las tarjetas que
// reemplazó: que un cero se afirme como tranquilidad y no como vacío, que
// "virtual" no sea una categoría más, y que cada tarjeta filtre la tabla.
//
// Las cifras son las de la flota real del tenant 111 (medida 2026-08-31).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FleetOverviewCards from "./FleetOverviewCards";

afterEach(cleanup);

const fleet = {
  total: 53,
  composition: { laptop: 26, desktop: 15, server: 11, unknown: 1, virtual: 11 },
  attention: { diskHigh: 5, diskUnknown: 1, thresholdPct: 85 },
  underSpec: { lowMemory: 4, memoryUnknown: 0, floorGb: 8 },
};

const flotaSana = {
  ...fleet,
  attention: { diskHigh: 0, diskUnknown: 0, thresholdPct: 85 },
  underSpec: { lowMemory: 0, memoryUnknown: 0, floorGb: 8 },
};

function renderCards(props = {}) {
  const onSelect = vi.fn();
  render(
    <FleetOverviewCards
      fleet={fleet}
      loading={false}
      activeFilter="all"
      onSelect={onSelect}
      {...props}
    />
  );
  return { onSelect };
}

describe("FleetOverviewCards — lo que dice", () => {
  it("muestra las tres cifras y el umbral con el que se contaron", () => {
    renderCards();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText(/over 85% disk usage/i)).toBeTruthy();
    expect(screen.getByText("53")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText(/at or below 8 GB/i)).toBeTruthy();
  });

  it("⚠️ un cero se afirma, no se deja en blanco", () => {
    // Una tarjeta vacía se confunde con una que no cargó. "Ningún equipo pasa
    // del 85%" es una respuesta y tiene que leerse como tal.
    renderCards({ fleet: flotaSana });
    expect(screen.getByText(/no device is over 85% disk/i)).toBeTruthy();
    expect(screen.getByText(/every device is over 8 GB/i)).toBeTruthy();
  });

  it("⚠️ mientras carga NO afirma cero", () => {
    // Decir "0 equipos por atender" antes de tener los datos es exactamente la
    // mentira tranquilizadora que esta fila existe para evitar.
    render(<FleetOverviewCards fleet={null} loading activeFilter="all" onSelect={vi.fn()} />);
    expect(screen.queryByText(/no device is over/i)).toBeNull();
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it("el 'sin dato' de disco se muestra aparte del conteo de disco alto", () => {
    renderCards();
    // 5 arriba, 1 sin medir — nunca 6.
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText(/1 not reporting disk/i)).toBeTruthy();
  });

  it("no inventa el chip de 'sin dato' cuando todos reportan", () => {
    renderCards({ fleet: flotaSana });
    expect(screen.queryByText(/not reporting disk/i)).toBeNull();
  });
});

describe("FleetOverviewCards — composición", () => {
  it("las cuatro categorías se listan con su conteo", () => {
    renderCards();
    expect(screen.getByText(/Laptops 26/)).toBeTruthy();
    expect(screen.getByText(/Desktops 15/)).toBeTruthy();
    expect(screen.getByText(/Servers 11/)).toBeTruthy();
    expect(screen.getByText(/Unclassified 1/)).toBeTruthy();
  });

  it("⚠️ 'virtual' aparece aparte de las categorías, no como una quinta", () => {
    // Es un eje que las atraviesa: en esta flota los 11 virtuales SON los 11
    // servidores. Como quinto segmento, la barra sumaría 64 sobre 53 equipos.
    renderCards();
    expect(screen.getByText("11 virtual")).toBeTruthy();
    expect(screen.getByText(/Servers 11/)).toBeTruthy();
  });

  it("una categoría en cero no ensucia la leyenda", () => {
    renderCards({
      fleet: { ...fleet, composition: { ...fleet.composition, unknown: 0 } },
    });
    expect(screen.queryByText(/Unclassified/)).toBeNull();
  });

  it("sin equipos virtuales no se muestra el chip", () => {
    renderCards({
      fleet: { ...fleet, composition: { ...fleet.composition, virtual: 0 } },
    });
    expect(screen.queryByText(/virtual/i)).toBeNull();
  });
});

describe("FleetOverviewCards — las tarjetas filtran", () => {
  it("la tarjeta de atención pide el filtro de disco alto", () => {
    const { onSelect } = renderCards();
    fireEvent.click(screen.getByText(/over 85% disk usage/i));
    expect(onSelect).toHaveBeenCalledWith("disk_high");
  });

  it("cada segmento de la composición pide el suyo", () => {
    const { onSelect } = renderCards();
    fireEvent.click(screen.getByText(/Laptops 26/));
    expect(onSelect).toHaveBeenCalledWith("laptop");

    fireEvent.click(screen.getByText(/Servers 11/));
    expect(onSelect).toHaveBeenCalledWith("server");
  });

  it("el chip de virtual filtra por su propio eje", () => {
    const { onSelect } = renderCards();
    fireEvent.click(screen.getByText("11 virtual"));
    expect(onSelect).toHaveBeenCalledWith("virtual");
  });

  it("el chip de 'sin dato' filtra por sin dato, no por disco alto", () => {
    const { onSelect } = renderCards();
    fireEvent.click(screen.getByText(/1 not reporting disk/i));
    expect(onSelect).toHaveBeenCalledWith("disk_unknown");
    expect(onSelect).not.toHaveBeenCalledWith("disk_high");
  });

  it("la tarjeta de equipos cortos pide su filtro", () => {
    const { onSelect } = renderCards();
    fireEvent.click(screen.getByText(/at or below 8 GB/i));
    expect(onSelect).toHaveBeenCalledWith("low_memory");
  });

  it("⚠️ una tarjeta en cero no ofrece un filtro que daría una tabla vacía", () => {
    // Filtrar por "disco alto" cuando no hay ninguno deja al usuario mirando
    // una tabla vacía sin saber si filtró mal o si de verdad no hay nada.
    const { onSelect } = renderCards({ fleet: flotaSana });
    fireEvent.click(screen.getByText(/no device is over 85% disk/i));
    expect(onSelect).toHaveBeenCalledWith("all");
  });

  it("se puede navegar con el teclado", () => {
    const { onSelect } = renderCards();
    const cards = screen.getAllByRole("button");
    fireEvent.keyDown(cards[0], { key: "Enter" });
    expect(onSelect).toHaveBeenCalled();
  });

  it("marca cuál filtro está activo para quien usa lector de pantalla", () => {
    renderCards({ activeFilter: "low_memory" });
    const activa = screen
      .getAllByRole("button")
      .filter((el) => el.getAttribute("aria-pressed") === "true");
    expect(activa).toHaveLength(1);
    expect(activa[0].getAttribute("aria-label")).toMatch(/8 GB/);
  });
});

describe("FleetOverviewCards — datos incompletos", () => {
  it("no explota con un resumen a medias", () => {
    render(<FleetOverviewCards fleet={{}} loading={false} activeFilter="all" onSelect={vi.fn()} />);
    expect(screen.getAllByRole("button").length).toBe(3);
  });
});
