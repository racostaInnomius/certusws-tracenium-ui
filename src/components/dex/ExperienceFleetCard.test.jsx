// src/components/dex/ExperienceFleetCard.test.jsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/dex", () => ({ getDeviceExperience: vi.fn(), getFleetExperience: vi.fn() }));
import { getFleetExperience } from "../../api/dex";
import ExperienceFleetCard from "./ExperienceFleetCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FLEET = {
  reporting: 40,
  eventsNotCollected: 3,
  withSignals: 2,
  counts: [
    { key: "high_cpu", label: "Sustained high CPU", devices: 1 },
    { key: "unstable_app", label: "Unstable application", devices: 1 },
    { key: "slow_boot", label: "Slow boot", devices: 1 },
    { key: "worn_battery", label: "Worn battery", devices: 0 },
  ],
  devices: [
    { agentId: "pc-1", hostname: "FINANZAS-03", signals: [{ key: "high_cpu", label: "Sustained high CPU", evidence: "CPU averaged ≥ 85% for 60 min in the last 24 h" }, { key: "unstable_app", label: "Unstable application", evidence: "OUTLOOK.EXE ×3 in 7 days" }] },
    { agentId: "pc-2", hostname: "VENTAS-11", signals: [{ key: "slow_boot", label: "Slow boot", evidence: "Last boot took 2 min 40 s" }] },
  ],
};

describe("ExperienceFleetCard", () => {
  it("⭐ equipos con señales y su evidencia; al pulsar uno se abre su ficha", async () => {
    getFleetExperience.mockResolvedValue({ ok: true, fleet: FLEET });
    const onOpenDevice = vi.fn();
    render(<ExperienceFleetCard onOpenDevice={onOpenDevice} />);
    expect(await screen.findByText(/2 of 40 reporting devices with signals/)).toBeInTheDocument();
    expect(screen.queryByTestId("dex-count-worn_battery")).toBeNull();
    fireEvent.click(screen.getByText("FINANZAS-03"));
    expect(onOpenDevice).toHaveBeenCalledWith("pc-1", "FINANZAS-03");
  });

  it("filtrar por una señal deja sólo sus equipos", async () => {
    getFleetExperience.mockResolvedValue({ ok: true, fleet: FLEET });
    render(<ExperienceFleetCard />);
    fireEvent.click(await screen.findByTestId("dex-count-slow_boot"));
    expect(screen.queryByText("FINANZAS-03")).toBeNull();
    expect(screen.getByText("VENTAS-11")).toBeInTheDocument();
  });

  it("⚠️ dice cuántos no pudieron leer sus crashes: su «sin señales» es «no se sabe»", async () => {
    getFleetExperience.mockResolvedValue({ ok: true, fleet: FLEET });
    render(<ExperienceFleetCard />);
    expect(await screen.findByTestId("dex-events-blind")).toHaveTextContent("3 reporting devices could not read crash logs");
  });

  it("sin ningún equipo que informe (o sin la función desplegada), la tarjeta no ocupa sitio", async () => {
    getFleetExperience.mockResolvedValue({ ok: true, fleet: { ...FLEET, reporting: 0, withSignals: 0, devices: [] } });
    const { container } = render(<ExperienceFleetCard />);
    await waitFor(() => expect(getFleetExperience).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    cleanup();
    getFleetExperience.mockRejectedValue({ status: 404 });
    const second = render(<ExperienceFleetCard />);
    await waitFor(() => expect(getFleetExperience).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });
});
