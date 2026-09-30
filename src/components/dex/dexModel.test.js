// src/components/dex/dexModel.test.js
import { describe, expect, it } from "vitest";
import { buildTimeline, formatDuration, groupEvents, isAwakeWindow, periodSummary, seriesWithGaps, dayTicks, timelineEvents, withLastBoot } from "./dexModel";

const w = (iso, cpu, mem = 50, samples = 15, max = null) => ({ startUtc: iso, minutes: 15, samples, cpuAvgPct: cpu, cpuMaxPct: max ?? cpu, memAvgPct: mem, memMaxPct: mem });

describe("dexModel", () => {
  it("⭐ un hueco (equipo dormido) corta la línea: no se une con una recta inventada", () => {
    const s = seriesWithGaps([w("2026-09-21T10:00:00Z", 20), w("2026-09-21T10:15:00Z", 30), w("2026-09-21T12:00:00Z", 40)]);
    expect(s.map((p) => p.cpuAvg)).toEqual([20, 30, null, 40]);
    expect(seriesWithGaps([w("2026-09-21T10:00:00Z", 20), w("2026-09-21T10:15:00Z", 30)]).map((p) => p.cpuAvg)).toEqual([20, 30]);
  });

  it("el resumen pondera por muestras (una ventana de 1 muestra no pesa como una de 15)", () => {
    expect(periodSummary([w("2026-09-21T10:00:00Z", 10, 40, 15, 30), w("2026-09-21T10:15:00Z", 100, 90, 1, 100)])).toEqual({ samples: 16, cpuAvg: 16, cpuPeak: 100, memAvg: 43, memPeak: 90 });
    expect(periodSummary([])).toEqual({ samples: 0, cpuAvg: null, cpuPeak: null, memAvg: null, memPeak: null });
  });

  it("eventos: apps agrupadas sin distinguir mayúsculas; los del sistema sueltos; fuera del periodo no cuentan", () => {
    const g = groupEvents(
      [
        { kind: "app_crash", occurredAtUtc: "2026-09-20T10:00:00Z", app: "OUTLOOK.EXE" },
        { kind: "app_hang", occurredAtUtc: "2026-09-20T11:00:00Z", app: "outlook.exe" },
        { kind: "os_crash", occurredAtUtc: "2026-09-19T08:00:00Z", app: null, detail: "0x0000009f" },
        { kind: "app_crash", occurredAtUtc: "2026-08-01T00:00:00Z", app: "old.exe" },
      ],
      Date.parse("2026-09-14T00:00:00Z")
    );
    expect(g.apps).toEqual([{ app: "OUTLOOK.EXE", crashes: 1, hangs: 1, last: "2026-09-20T11:00:00Z" }]);
    expect(g.system).toHaveLength(1);
    expect(formatDuration(160_000)).toBe("2 min 40 s");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("dayTicks", () => {
  // 15 min de ventana durante 3 días: Recharts ponía una marca cada pocas
  // horas y el formato de día las rotulaba todas igual («Sep 22» ×9).
  const punto = (iso) => ({ t: new Date(iso).getTime() });
  const tresDias = Array.from({ length: 3 * 96 }, (_, i) => ({ t: new Date(2026, 8, 22, 0, 0).getTime() + i * 15 * 60_000 }));

  it("⭐ una marca por día, a medianoche local, sin repetir día", () => {
    const ticks = dayTicks(tresDias);
    expect(ticks).toHaveLength(3);
    for (const t of ticks) {
      const d = new Date(t);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    }
    expect(new Set(ticks.map((t) => new Date(t).getDate())).size).toBe(3);
  });

  it("con 30 días no pasa del máximo", () => {
    const mes = Array.from({ length: 30 * 24 }, (_, i) => ({ t: new Date(2026, 7, 26).getTime() + i * 3_600_000 }));
    expect(dayTicks(mes, 8).length).toBeLessThanOrEqual(8);
  });

  it("sin datos suficientes no fuerza marcas (Recharts decide)", () => {
    expect(dayTicks([])).toBeUndefined();
    expect(dayTicks([punto("2026-09-22T10:00:00Z")])).toBeUndefined();
  });
});

// ── La cronología ────────────────────────────────────────────────────
//
// Datos REALES de CLIFIJIMENEZlocal.local (Mac de T1), tal cual salieron de
// device_dex_windows el 29-sep-2026: «ayer estuvo colgado y lento». Esta es la
// cronología que hubo que reconstruir a mano consultando la base.
const REAL = [
  ["2026-09-28T11:30:00Z", 1, 15.6, 15.6, 76.25, 76.25],
  ["2026-09-28T11:45:00Z", 11, 15.79, 20.83, 75.37, 76.47],
  ["2026-09-28T12:00:00Z", 15, 10.39, 16.08, 75.8, 76.4],
  ["2026-09-28T12:15:00Z", 15, 12.32, 13.31, 75.4, 80.41],
  ["2026-09-28T20:45:00Z", 1, 11.82, 11.82, 74.8, 74.8],
  ["2026-09-28T21:00:00Z", 2, 35.4, 49.76, 75.92, 77.72],
  ["2026-09-28T21:15:00Z", 2, 24.74, 33.2, 73.81, 74.07],
  ["2026-09-28T21:30:00Z", 2, 15.93, 18.73, 75.51, 76.88],
  ["2026-09-29T04:00:00Z", 2, 26.7, 32.28, 73.73, 74.45],
  ["2026-09-29T04:15:00Z", 1, 11.88, 11.88, 77.9, 77.9],
  ["2026-09-29T04:30:00Z", 11, 44.74, 52.31, 78.99, 80.34],
  ["2026-09-29T04:45:00Z", 15, 39.57, 54.93, 77.28, 80.26],
  ["2026-09-29T05:00:00Z", 15, 40.02, 43.54, 77.56, 80.32],
  ["2026-09-29T05:15:00Z", 15, 40.24, 46.25, 78.46, 80.35],
  ["2026-09-29T05:30:00Z", 15, 40.81, 47.72, 79.03, 84.1],
  ["2026-09-29T05:45:00Z", 15, 41.92, 46.16, 79.48, 81.36],
  ["2026-09-29T06:00:00Z", 15, 42.03, 47.7, 79.55, 81.02],
  ["2026-09-29T06:15:00Z", 15, 43.24, 46.13, 79.92, 82.68],
  ["2026-09-29T06:30:00Z", 10, 42.82, 76.46, 66.44, 69.5],
  ["2026-09-29T06:45:00Z", 15, 31.82, 38.43, 65.34, 70.45],
  ["2026-09-29T07:00:00Z", 15, 30.09, 34.15, 64.96, 67.2],
].map(([startUtc, samples, cpuAvgPct, cpuMaxPct, memAvgPct, memMaxPct]) => ({ startUtc, minutes: 15, samples, cpuAvgPct, cpuMaxPct, memAvgPct, memMaxPct }));
const WHATSAPP = { kind: "app_crash", occurredAtUtc: "2026-09-29T06:31:50Z", app: "WhatsApp", detail: "EXC_CRASH SIGKILL (Code Signature Invalid) · CODESIGNING: Launch Constraint Violation" };
// El arranque real fue a las 06:34Z; este evento es el que manda el agente nuevo.
const RESTART = { kind: "restart", occurredAtUtc: "2026-09-29T06:34:00Z", app: null, detail: "previous shutdown was clean (cause 5)" };
const at = (iso) => Date.parse(iso);

describe("buildTimeline", () => {
  it("⭐ el caso real: despierto y cargado, crash, reinicio, y lo de antes dormido — en orden, lo más reciente arriba", () => {
    const tl = buildTimeline(REAL, [WHATSAPP, RESTART]);
    expect(tl.map((e) => [e.type, e.kind ?? null, new Date(e.t).toISOString()])).toEqual([
      ["awake", null, "2026-09-29T06:34:00.000Z"], // tras el reinicio: empieza EN el reinicio, encima de él
      ["event", "restart", "2026-09-29T06:34:00.000Z"],
      ["event", "app_crash", "2026-09-29T06:31:50.000Z"],
      ["awake", null, "2026-09-29T04:30:00.000Z"],
      ["asleep", null, "2026-09-28T12:30:00.000Z"],
      ["awake", null, "2026-09-28T11:45:00.000Z"],
    ]);
    // Las dos horas lentas, con su carga: lo que había que calcular a mano.
    expect(tl[3]).toMatchObject({ end: at("2026-09-29T06:30:00Z"), cpuAvg: 41, cpuPeak: 55, memAvg: 79, memPeak: 84 });
    // Y después de reiniciar la memoria baja: el antes y el después NO se promedian juntos.
    expect(tl[0]).toMatchObject({ cpuAvg: 34, memAvg: 65 });
    // El día: dormido, con seis despertares de una o dos muestras.
    expect(tl[4]).toMatchObject({ end: at("2026-09-29T04:30:00Z"), wakes: 6 });
  });

  it("🔴 sin evento de arranque (agente anterior) NO se inventa un reinicio: el tramo sigue entero", () => {
    const tl = buildTimeline(REAL, [WHATSAPP]);
    expect(tl.filter((e) => e.type === "event").map((e) => e.kind)).toEqual(["app_crash"]);
    // El crash (06:31) va encima del tramo porque éste EMPEZÓ antes (04:30) y no se corta.
    expect(tl.map((e) => e.type)).toEqual(["event", "awake", "asleep", "awake"]);
    expect(tl[1]).toMatchObject({ t: at("2026-09-29T04:30:00Z"), end: at("2026-09-29T07:15:00Z") });
  });

  it("⚠️ una ventana con 1 o 2 muestras de 15 es un Mac que despertó un momento, no uso", () => {
    expect(isAwakeWindow({ minutes: 15, samples: 2 })).toBe(false);
    expect(isAwakeWindow({ minutes: 15, samples: 7 })).toBe(false);
    expect(isAwakeWindow({ minutes: 15, samples: 8 })).toBe(true);
    // Y un tramo sólo de despertares breves, antes del primer dato despierto, no se pinta.
    expect(buildTimeline(REAL.slice(0, 1), []).length).toBe(0);
  });

  it("⭐ Windows manda el 41 y el 12 del mismo reinicio: sale UNO, el que dice más", () => {
    const evs = timelineEvents([
      { kind: "unexpected_shutdown", occurredAtUtc: "2026-09-19T07:59:58Z" },
      { kind: "restart", occurredAtUtc: "2026-09-19T08:00:01Z" },
      { kind: "restart", occurredAtUtc: "2026-09-20T08:00:00Z" },
    ]);
    expect(evs.map((e) => e.kind)).toEqual(["unexpected_shutdown", "restart"]);
  });

  it("un apagado inesperado también corta el tramo", () => {
    const tl = buildTimeline(REAL, [{ kind: "unexpected_shutdown", occurredAtUtc: "2026-09-29T06:34:00Z", detail: "cause 3: forced: power button held" }]);
    expect(tl.slice(0, 3).map((e) => e.type)).toEqual(["awake", "event", "awake"]);
    expect(tl[1].detail).toBe("cause 3: forced: power button held");
  });

  it("lo anterior al periodo no entra", () => {
    const tl = buildTimeline(REAL, [WHATSAPP, RESTART], at("2026-09-29T00:00:00Z"));
    expect(tl.some((e) => e.t < at("2026-09-29T00:00:00Z"))).toBe(false);
    expect(tl.at(-1)).toMatchObject({ type: "awake", t: at("2026-09-29T04:30:00Z") });
  });
});

describe("withLastBoot", () => {
  it("⭐ el último arranque (inventario) entra como reinicio si nada lo cuenta, y dice que la causa no se sabe", () => {
    const evs = withLastBoot([WHATSAPP], "2026-09-29T06:34:00Z");
    expect(evs.at(-1)).toEqual({ kind: "restart", occurredAtUtc: "2026-09-29T06:34:00.000Z", app: null, detail: "shutdown cause not reported" });
    // Y con él la cronología de HOY ya corta la noche en el reinicio.
    const tl = buildTimeline(REAL, evs);
    expect(tl.slice(0, 4).map((e) => e.type)).toEqual(["awake", "event", "event", "awake"]);
    expect(tl[3]).toMatchObject({ cpuAvg: 41, memPeak: 84 });
  });

  it("no duplica un arranque que el agente ya contó (reinicio, apagado inesperado o caída)", () => {
    expect(withLastBoot([RESTART], "2026-09-29T06:34:30Z")).toEqual([RESTART]);
    const forced = { kind: "unexpected_shutdown", occurredAtUtc: "2026-09-29T06:33:00Z" };
    expect(withLastBoot([forced], "2026-09-29T06:34:00Z")).toEqual([forced]);
  });

  it("sin arranque conocido no inventa nada", () => {
    expect(withLastBoot([WHATSAPP], null)).toEqual([WHATSAPP]);
    expect(withLastBoot([WHATSAPP], "no-es-fecha")).toEqual([WHATSAPP]);
  });
});

