// src/components/dex/ExperienceTab.test.jsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

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

  it("⚠️ mientras carga ocupa el mismo alto: entrar en la pestaña no mueve la página", async () => {
    let resolve;
    getDeviceExperience.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { container } = render(<ExperienceTab agentId="pc-1" />);
    expect(screen.getByText("Loading experience data…")).toBeInTheDocument();
    expect(container.firstChild).toHaveStyle({ minHeight: "420px" });
    resolve({ ok: true, device: device() });
    await screen.findByTestId("dex-experience");
    expect(screen.getByTestId("dex-experience")).toHaveStyle({ minHeight: "420px" });
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

  it("⭐ la cronología del caso real (CLIFIJIMENEZlocal.local): lo que hubo que sacar de la base, en la pantalla", async () => {
    // Reloj fijo: el periodo se corta respecto a «ahora». TZ de los tests: America/Mexico_City.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T23:00:00Z"));
    try {
      const W = (startUtc, samples, cpuAvgPct, cpuMaxPct, memAvgPct, memMaxPct) => ({ startUtc, minutes: 15, samples, cpuAvgPct, cpuMaxPct, memAvgPct, memMaxPct });
      const windows = [
        W("2026-09-28T11:45:00Z", 11, 15.79, 20.83, 75.37, 76.47), W("2026-09-28T12:00:00Z", 15, 10.39, 16.08, 75.8, 76.4), W("2026-09-28T12:15:00Z", 15, 12.32, 13.31, 75.4, 80.41),
        W("2026-09-28T20:45:00Z", 1, 11.82, 11.82, 74.8, 74.8), W("2026-09-28T21:00:00Z", 2, 35.4, 49.76, 75.92, 77.72), W("2026-09-28T21:15:00Z", 2, 24.74, 33.2, 73.81, 74.07),
        W("2026-09-28T21:30:00Z", 2, 15.93, 18.73, 75.51, 76.88), W("2026-09-29T04:00:00Z", 2, 26.7, 32.28, 73.73, 74.45), W("2026-09-29T04:15:00Z", 1, 11.88, 11.88, 77.9, 77.9),
        W("2026-09-29T04:30:00Z", 11, 44.74, 52.31, 78.99, 80.34), W("2026-09-29T04:45:00Z", 15, 39.57, 54.93, 77.28, 80.26), W("2026-09-29T05:00:00Z", 15, 40.02, 43.54, 77.56, 80.32),
        W("2026-09-29T05:15:00Z", 15, 40.24, 46.25, 78.46, 80.35), W("2026-09-29T05:30:00Z", 15, 40.81, 47.72, 79.03, 84.1), W("2026-09-29T05:45:00Z", 15, 41.92, 46.16, 79.48, 81.36),
        W("2026-09-29T06:00:00Z", 15, 42.03, 47.7, 79.55, 81.02), W("2026-09-29T06:15:00Z", 15, 43.24, 46.13, 79.92, 82.68), W("2026-09-29T06:30:00Z", 10, 42.82, 76.46, 66.44, 69.5),
        W("2026-09-29T06:45:00Z", 15, 31.82, 38.43, 65.34, 70.45), W("2026-09-29T07:00:00Z", 15, 30.09, 34.15, 64.96, 67.2),
      ];
      const events = [
        { kind: "app_crash", occurredAtUtc: "2026-09-29T06:31:50Z", app: "WhatsApp", detail: "EXC_CRASH SIGKILL (Code Signature Invalid) · CODESIGNING: Launch Constraint Violation" },
        { kind: "unexpected_shutdown", occurredAtUtc: "2026-09-29T06:34:00Z", app: null, detail: "cause 3: forced: power button held" },
      ];
      // En un Mac el arranque de DEX va vacío (sin duración que leer).
      getDeviceExperience.mockResolvedValue({ ok: true, device: device({ signals: [], windows, events, status: { ...device().status, lastBootUtc: null } }) });
      render(<ExperienceTab agentId="8200bb2b" />);
      const tl = await screen.findByTestId("dex-timeline");

      // Lo más reciente arriba, por días, en la hora de quien mira (UTC-6).
      expect(within(tl).getByText("Tue, Sep 29")).toBeInTheDocument();
      expect(within(tl).getByText("Mon, Sep 28")).toBeInTheDocument();
      const rows = within(tl).getAllByTestId(/^dex-tl-/).map((r) => r.textContent);
      expect(rows).toEqual([
        "00:34 – 01:15Awake CPU 34% avg (peak 76%) · memory 65% (peak 70%) · 41 min",
        "00:34Unexpected shutdown cause 3: forced: power button held",
        "00:31Application crash: WhatsApp EXC_CRASH SIGKILL (Code Signature Invalid) · CODESIGNING: Launch Constraint Violation",
        // Las dos horas lentas, cruzando la medianoche, con la carga que hubo que calcular a mano.
        "22:30 – Sep 29, 00:30Awake CPU 41% avg (peak 55%) · memory 79% (peak 84%) · 2 h",
        "06:30 – 22:30Asleep or off woke briefly 6 times · 16 h",
        "05:45 – 06:30Awake CPU 13% avg (peak 21%) · memory 76% (peak 80%) · 45 min",
      ]);
      // Y en la gráfica, el reinicio marcado (rojo: fue inesperado).
      expect(screen.getByText(/Dashed lines mark restarts/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("⭐ HOY, sin agente nuevo: el arranque del inventario marca el reinicio en la cronología y en «Last boot»", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T23:00:00Z"));
    try {
      const W = (startUtc, samples, cpu, mem) => ({ startUtc, minutes: 15, samples, cpuAvgPct: cpu, cpuMaxPct: cpu, memAvgPct: mem, memMaxPct: mem });
      const windows = [W("2026-09-29T06:00:00Z", 15, 42, 79), W("2026-09-29T06:15:00Z", 15, 43, 80), W("2026-09-29T06:30:00Z", 10, 42, 66), W("2026-09-29T06:45:00Z", 15, 31, 65)];
      const status = { ...device().status, lastBootUtc: null, bootDurationMs: null, inventoryLastBootUtc: "2026-09-29T06:34:00.000Z", scope: { resources: "collected", events: "collected", boot: "unsupported", battery: "collected" } };
      getDeviceExperience.mockResolvedValue({ ok: true, device: device({ signals: [], windows, events: [], status }) });
      render(<ExperienceTab agentId="8200bb2b" />);
      const tl = await screen.findByTestId("dex-timeline");
      expect(within(tl).getAllByTestId(/^dex-tl-/).map((r) => r.textContent)).toEqual([
        // (42·10 + 31·15) / 25 muestras = 35,4
        "00:34 – 01:00Awake CPU 35% avg (peak 42%) · memory 65% (peak 66%) · 26 min",
        "00:34Restarted shutdown cause not reported",
        "00:00 – 00:30Awake CPU 43% avg (peak 43%) · memory 80% (peak 80%) · 30 min",
      ]);
      // El dato del inventario también llena la fecha de «Last boot», que en un Mac iba vacía.
      expect(screen.getByText("Last boot").parentElement).toHaveTextContent(/Sep 29/);
    } finally {
      vi.useRealTimers();
    }
  });
});

