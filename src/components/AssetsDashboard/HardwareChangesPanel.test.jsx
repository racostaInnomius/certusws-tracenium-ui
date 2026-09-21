import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HardwareChangesView } from "./HardwareChangesPanel";

describe("HardwareChangesView — los tres vacíos no son el mismo", () => {
  it("backend sin detección: no pinta nada", () => {
    const { container } = render(<HardwareChangesView data={{ available: false, baselineAt: null, changes: [] }} />);
    expect(container.textContent).toBe("");
  });

  it("⚠️ sin línea base NO dice 'sin cambios'", () => {
    render(<HardwareChangesView data={{ available: true, baselineAt: null, changes: [] }} />);
    expect(screen.getByText(/Not tracked yet/)).toBeTruthy();
    expect(screen.queryByText(/No hardware changes/)).toBeNull();
  });

  it("vigilado sin cambios: dice desde cuándo", () => {
    render(<HardwareChangesView data={{ available: true, baselineAt: "2026-09-22T08:00:00Z", changes: [] }} />);
    expect(screen.getByText(/No hardware changes since/)).toBeTruthy();
  });

  it("con cambios: componente, antes y después", () => {
    render(
      <HardwareChangesView
        data={{
          available: true,
          baselineAt: "2026-09-22T08:00:00Z",
          changes: [{ id: "1", component: "memory", before: "16 GB in 2 modules", after: "8 GB in 1 module", detectedAt: "2026-09-23T10:00:00Z" }],
        }}
      />
    );
    expect(screen.getByText("Memory")).toBeTruthy();
    expect(screen.getByText("16 GB in 2 modules")).toBeTruthy();
    expect(screen.getByText("8 GB in 1 module")).toBeTruthy();
  });
});
