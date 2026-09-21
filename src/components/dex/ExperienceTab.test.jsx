// src/components/dex/ExperienceTab.test.jsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/dex", () => ({ getDeviceExperience: vi.fn(), getFleetExperience: vi.fn() }));
import { getDeviceExperience } from "../../api/dex";
import ExperienceTab from "./ExperienceTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60_000).toISOString();
const device = (over = {}) => ({
  agentId: "pc-1",
  available: true,
  days: 7,
  status: {
    lastReportAt: iso(20),
    scope: { resources: "collected", events: "collected", boot: "collected", battery: "collected" },
    lastBootUtc: iso(300),
    bootDurationMs: 160_000,
    battery: { present: true, healthPct: 58.4, cycleCount: 612 },
  },
  signals: [
    { key: "unstable_app", label: "Unstable application", evidence: "OUTLOOK.EXE ×3 in 7 days" },
    { key: "slow_boot", label: "Slow boot", evidence: "Last boot took 2 min 40 s" },
  ],
  windows: [60, 45, 30].map((m) => ({ startUtc: iso(m), minutes: 15, samples: 15, cpuAvgPct: 40, cpuMaxPct: 90, memAvgPct: 60, memMaxPct: 70 })),
  events: [
    { kind: "app_crash", occurredAtUtc: iso(600), app: "OUTLOOK.EXE", detail: "c0000005" },
    { kind: "app_crash", occurredAtUtc: iso(500), app: "OUTLOOK.EXE", detail: null },
    { kind: "os_crash", occurredAtUtc: iso(900), app: null, detail: "0x0000009f" },
  ],
  ...over,
});

describe("ExperienceTab", () => {
  it("⭐ señales con su evidencia, resumen, gráfica y eventos agrupados", async () => {
    getDeviceExperience.mockResolvedValue({ ok: true, device: device() });
    render(<ExperienceTab agentId="pc-1" />);
    expect(await screen.findByText("OUTLOOK.EXE ×3 in 7 days")).toBeInTheDocument();
    expect(screen.getByText("Last boot took 2 min 40 s")).toBeInTheDocument();
    expect(screen.getByText("40% avg")).toBeInTheDocument();
    expect(screen.getByText("58% health")).toBeInTheDocument();
    expect(screen.getByText("612 cycles")).toBeInTheDocument();
    expect(screen.getByTestId("dex-chart")).toBeInTheDocument();
    expect(screen.getByTestId("dex-events")).toHaveTextContent("OUTLOOK.EXE — 2 crashes");
    expect(screen.getByTestId("dex-events")).toHaveTextContent("System crash");
    expect(screen.getByText(/A gap means the device was off or asleep/)).toBeInTheDocument();
    expect(getDeviceExperience).toHaveBeenCalledWith("pc-1", 7);
  });

  it("⚠️ sin crashes leídos, «ninguno» no se dice: se avisa de que no se sabe", async () => {
    getDeviceExperience.mockResolvedValue({ ok: true, device: device({ signals: [], events: [], status: { ...device().status, scope: { resources: "collected", events: "unavailable", boot: "unsupported", battery: "collected" } } }) });
    render(<ExperienceTab agentId="pc-1" />);
    expect(await screen.findByText(/no crashes shown does NOT mean none happened/)).toBeInTheDocument();
    expect(screen.getByText(/Boot duration is not available on this platform/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown — see the note above/)).toBeInTheDocument();
    expect(screen.queryByText(/No crashes, hangs or system failures recorded/)).toBeNull();
  });

  it("un equipo que aún no informa dice «sin datos», no «todo bien»", async () => {
    getDeviceExperience.mockResolvedValue({ ok: true, device: { agentId: "pc-2", available: false, signals: [], windows: [], events: [] } });
    render(<ExperienceTab agentId="pc-2" />);
    expect(await screen.findByTestId("dex-unavailable")).toHaveTextContent(/No experience data from this device yet/);
    expect(screen.queryByTestId("dex-no-signals")).toBeNull();
  });

  it("el periodo se elige y se vuelve a pedir", async () => {
    getDeviceExperience.mockResolvedValue({ ok: true, device: device() });
    render(<ExperienceTab agentId="pc-1" />);
    (await screen.findByRole("button", { name: "30 days" })).click();
    await waitFor(() => expect(getDeviceExperience).toHaveBeenLastCalledWith("pc-1", 30));
  });
});
