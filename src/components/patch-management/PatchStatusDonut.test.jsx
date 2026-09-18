// src/components/patch-management/PatchStatusDonut.test.jsx

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PatchStatusDonut from "./PatchStatusDonut";

afterEach(cleanup);

describe("PatchStatusDonut", () => {
  it("⭐ el título dice OS: cuenta parches del sistema operativo, no aplicaciones", () => {
    render(<PatchStatusDonut statusBreakdown={{ healthy: 1 }} />);
    expect(screen.getByText("OS patch status")).toBeInTheDocument();
    expect(screen.getByText(/Operating-system updates/)).toBeInTheDocument();
  });

  it("cada banda filtra la tabla, y la seleccionada se anuncia como pulsada", () => {
    const onSelectStatus = vi.fn();
    render(
      <PatchStatusDonut
        statusBreakdown={{ healthy: 2, updates_available: 3 }}
        selectedStatus="updates_available"
        onSelectStatus={onSelectStatus}
      />
    );
    const band = screen.getByRole("button", { name: /Updates available/ });
    expect(band).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Fully patched/ })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: /Fully patched/ }));
    expect(onSelectStatus).toHaveBeenCalledWith("healthy");
  });

  it("⚠️ sin onSelectStatus las bandas no invitan a pulsar", () => {
    render(<PatchStatusDonut statusBreakdown={{ healthy: 2 }} />);
    expect(screen.getByRole("button", { name: /Fully patched/ })).toBeDisabled();
  });

  it("⭐ contesta «cuánta flota está al día» con el porcentaje y el conteo", () => {
    render(<PatchStatusDonut statusBreakdown={{ healthy: 30, updates_available: 18, reboot_required: 4, error: 3 }} />);
    expect(screen.getByText("54%")).toBeInTheDocument();
    expect(screen.getByText("fully patched")).toBeInTheDocument();
    expect(screen.getByText(/30 of 55 reporting devices/)).toBeInTheDocument();
  });

  it("cada banda va con su nombre y su número: el color no es el único dato", () => {
    render(<PatchStatusDonut statusBreakdown={{ healthy: 2, updates_available: 1, reboot_required: 3 }} />);
    for (const label of ["Fully patched", "Updates available", "Reboot pending"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("🔴 avisa de lo que NO se sabe: un escaneo fallido llega con 0 pendientes", () => {
    render(<PatchStatusDonut statusBreakdown={{ healthy: 10, error: 3, inventory_only: 1 }} />);
    // 3 con escaneo fallido + 1 sólo-inventario.
    expect(screen.getByText(/4 not known to be patched/)).toBeInTheDocument();
    expect(screen.getByText(/10 of 14 reporting devices/)).toBeInTheDocument();
  });

  it("sin nadie reportando lo dice, no pinta un donut vacío", () => {
    render(<PatchStatusDonut statusBreakdown={{}} />);
    expect(screen.getByText(/No device has reported its patch status yet/)).toBeInTheDocument();
    expect(screen.queryByText("fully patched")).toBeNull();
  });
});
