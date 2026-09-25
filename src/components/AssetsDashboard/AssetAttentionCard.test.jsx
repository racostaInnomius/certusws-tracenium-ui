import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AssetAttentionCard from "./AssetAttentionCard";

afterEach(cleanup);

const A = {
  diskHigh: 5, diskUnknown: 1, diskThresholdPct: 85,
  lowMemory: 0, memoryUnknown: 0, memoryFloorGb: 8,
  osUnsupported: 1, osEndingSoon: 1, osUnknown: 0,
  staleBoot: 2, bootUnknown: 0, staleBootDays: 30,
  devices: 17,
};

describe("AssetAttentionCard", () => {
  it("⭐ las cuatro filas salen siempre, también a cero", () => {
    render(<AssetAttentionCard attention={A} />);
    expect(screen.getByText("Disk ≥ 85% full")).toBeInTheDocument();
    expect(screen.getByText("Memory ≤ 8 GB")).toBeInTheDocument();
    expect(screen.getByText("OS out of support")).toBeInTheDocument();
    expect(screen.getByText("OS support ending soon")).toBeInTheDocument();
    expect(screen.queryByText(/No restart/)).not.toBeInTheDocument();
    expect(screen.getByText("17 devices")).toBeInTheDocument();
    expect(screen.getByText("+1 not reporting disk")).toBeInTheDocument();
  });

  it("la fila de disco abre Hardware Inventory con su filtro; una fila a cero no es un enlace", () => {
    const onOpen = vi.fn();
    render(<AssetAttentionCard attention={A} onOpenFleetFilter={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /disk ≥ 85% full/i }));
    expect(onOpen).toHaveBeenCalledWith("disk_high");
    expect(screen.queryByRole("button", { name: /memory ≤ 8 gb/i })).not.toBeInTheDocument();
  });

  it("si la carga falla lo dice, en vez de enseñar ceros", () => {
    render(<AssetAttentionCard attention={null} error />);
    expect(screen.getByText(/could not load device health/i)).toBeInTheDocument();
    expect(screen.queryByText("OS out of support")).not.toBeInTheDocument();
  });
});
