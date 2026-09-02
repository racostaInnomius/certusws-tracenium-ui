// src/components/AssetManagement/FleetAttentionBand.test.jsx
//
// Lo único de la página que pide una acción hoy. Las otras dos tarjetas que
// vivían aquí se fueron por repetir una gráfica: "Under-spec" era la primera
// columna del histograma de memoria y el total ahora vive en el centro de la
// dona.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FleetAttentionBand from "./FleetAttentionBand";

afterEach(cleanup);

const attention = { diskHigh: 5, diskUnknown: 1, thresholdPct: 85 };
const sana = { diskHigh: 0, diskUnknown: 0, thresholdPct: 85 };

function renderBand(props = {}) {
  const onSelect = vi.fn();
  render(
    <FleetAttentionBand
      attention={attention}
      loading={false}
      activeFilter="all"
      onSelect={onSelect}
      {...props}
    />
  );
  return { onSelect };
}

describe("FleetAttentionBand", () => {
  it("dice cuántos y con qué umbral", () => {
    renderBand();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText(/over 85% disk usage/i)).toBeTruthy();
  });

  it("⚠️ un cero se afirma, no se deja en blanco", () => {
    renderBand({ attention: sana });
    expect(screen.getByText(/No device is over 85% disk/i)).toBeTruthy();
  });

  it("⚠️ mientras carga NO afirma cero", () => {
    render(<FleetAttentionBand attention={null} loading activeFilter="all" onSelect={vi.fn()} />);
    expect(screen.queryByText(/No device is over/i)).toBeNull();
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("el 'sin dato' va aparte del conteo, y filtra distinto", () => {
    const { onSelect } = renderBand();
    fireEvent.click(screen.getByText(/1 not reporting disk/i));
    expect(onSelect).toHaveBeenCalledWith("disk_unknown");
    expect(onSelect).not.toHaveBeenCalledWith("disk_high");
  });

  it("la banda filtra por disco alto", () => {
    const { onSelect } = renderBand();
    fireEvent.click(screen.getByText(/over 85% disk usage/i));
    expect(onSelect).toHaveBeenCalledWith("disk_high");
  });

  it("⚠️ en cero no ofrece un filtro que daría una tabla vacía", () => {
    const { onSelect } = renderBand({ attention: sana });
    fireEvent.click(screen.getByText(/No device is over 85% disk/i));
    expect(onSelect).toHaveBeenCalledWith("all");
  });

  it("marca el filtro activo para lectores de pantalla", () => {
    renderBand({ activeFilter: "disk_high" });
    // El chip de "sin dato" tambien es un button, asi que se busca por la
    // marca y no por el rol.
    const marcados = screen
      .getAllByRole("button")
      .filter((el) => el.getAttribute("aria-pressed") === "true");
    expect(marcados).toHaveLength(1);
    expect(marcados[0].getAttribute("aria-label")).toMatch(/85% disk/);
  });
});
