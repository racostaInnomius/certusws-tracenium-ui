// src/components/Compliance/DeviceBaselinesSection.test.jsx
//
// ADR-0037 F1 — la ficha del equipo dice en qué baselines está y qué tiene
// fuera de línea; sin baselines (o sin poder leerlos), no pinta nada.

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const getDeviceBaselines = vi.fn();
vi.mock("../../api/compliance", () => ({ getDeviceBaselines: (...a) => getDeviceBaselines(...a) }));

import DeviceBaselinesSection from "./DeviceBaselinesSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const counts = (over = {}) => ({ aligned: 0, deviation: 0, excepted: 0, not_applicable: 0, not_evaluated: 0, ...over });

describe("DeviceBaselinesSection", () => {
  it("⭐ cada baseline con su estado y los checks fuera de línea por título", async () => {
    getDeviceBaselines.mockResolvedValue({
      baselines: [
        { id: "b1", name: "Windows workstations", checks: 19, aligned: false, counts: counts({ aligned: 17, deviation: 2 }), deviations: [{ checkId: "c1", title: "SMB signing required" }, { checkId: "c2", title: null }] },
        { id: "b2", name: "PCI scope", checks: 5, aligned: true, counts: counts({ aligned: 5 }), deviations: [] },
        { id: "b3", name: "New lab", checks: 3, aligned: false, counts: counts({ not_evaluated: 3 }), deviations: [] },
      ],
    });
    render(<DeviceBaselinesSection agentId="d1" />);
    expect(await screen.findByText("2 of 19 out of line")).toBeInTheDocument();
    expect(screen.getByText("SMB signing required · c2")).toBeInTheDocument();
    expect(screen.getByText("Aligned")).toBeInTheDocument();
    expect(screen.getByText("Not measured yet")).toBeInTheDocument();
    expect(getDeviceBaselines).toHaveBeenCalledWith("d1");
  });

  it("sin baselines, o si falla la lectura, no hay sección", async () => {
    getDeviceBaselines.mockResolvedValue({ baselines: [] });
    const { container } = render(<DeviceBaselinesSection agentId="d1" />);
    await vi.waitFor(() => expect(getDeviceBaselines).toHaveBeenCalled());
    expect(container.querySelector("[data-testid=device-baselines]")).toBeNull();
    cleanup();
    getDeviceBaselines.mockRejectedValue(new Error("403"));
    const second = render(<DeviceBaselinesSection agentId="d2" />);
    await vi.waitFor(() => expect(getDeviceBaselines).toHaveBeenCalledWith("d2"));
    expect(second.container.querySelector("[data-testid=device-baselines]")).toBeNull();
  });
});
