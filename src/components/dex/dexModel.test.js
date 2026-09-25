// src/components/dex/dexModel.test.js
import { describe, expect, it } from "vitest";
import { formatDuration, groupEvents, periodSummary, seriesWithGaps, dayTicks } from "./dexModel";

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
