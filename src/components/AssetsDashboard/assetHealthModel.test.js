import { describe, it, expect } from "vitest";
import { attentionRows, checkInDonutData, checkInKeyOfName, checkInNameOfKey } from "./assetHealthModel";

describe("checkInDonutData", () => {
  it("de lo más reciente a lo más viejo, sin tramos vacíos", () => {
    const d = checkInDonutData({ lt1h: 12, lt24h: 1, lt7d: 4, gt7d: 0, never: 0, total: 17 });
    expect(d.map((x) => [x.name, x.value])).toEqual([
      ["< 1 hour", 12],
      ["< 24 hours", 1],
      ["1–7 days", 4],
    ]);
  });

  it("sin datos → vacío (la tarjeta enseña su fallback)", () => {
    expect(checkInDonutData(null)).toEqual([]);
  });
});

describe("attentionRows", () => {
  const A = {
    diskHigh: 5, diskUnknown: 1, diskThresholdPct: 85,
    lowMemory: 7, memoryUnknown: 0, memoryFloorGb: 8,
    osUnsupported: 1, osEndingSoon: 2, osUnknown: 3,
    staleBoot: 2, bootUnknown: 1, staleBootDays: 30,
    devices: 20,
  };

  it("⭐ la barra es sobre la FLOTA, no sobre la suma de filas (un equipo puede estar en varias)", () => {
    const disk = attentionRows(A).find((r) => r.key === "disk");
    expect(disk.percent).toBe(25);
  });

  it("⚠️ el «no sabemos» va aparte y nunca se suma", () => {
    const disk = attentionRows(A).find((r) => r.key === "disk");
    expect(disk).toMatchObject({ count: 5, unknown: 1 });
  });

  it("disco y memoria llevan a su filtro de Hardware Inventory; el resto no inventa uno", () => {
    const byKey = Object.fromEntries(attentionRows(A).map((r) => [r.key, r.fleetFilter]));
    expect(byKey).toEqual({ disk: "disk_high", memory: "low_memory", os_unsupported: undefined, os_ending: undefined, boot: undefined });
  });

  it("los umbrales vienen del backend", () => {
    const rows = attentionRows({ ...A, diskThresholdPct: 90, memoryFloorGb: 4, staleBootDays: 14 });
    expect(rows.map((r) => r.label)).toContain("Disk ≥ 90% full");
    expect(rows.map((r) => r.label)).toContain("Memory ≤ 4 GB");
    expect(rows.map((r) => r.label)).toContain("No restart in 14+ days");
  });
});

describe("rebanada de Last check-in ↔ filtro checkIn", () => {
  it("ida y vuelta en los cinco tramos", () => {
    for (const k of ["lt1h", "lt24h", "lt7d", "gt7d", "never"]) {
      expect(checkInKeyOfName(checkInNameOfKey(k))).toBe(k);
    }
  });
  it("lo que no es un tramo → null", () => {
    expect(checkInKeyOfName("__pending__")).toBeNull();
    expect(checkInNameOfKey("")).toBeNull();
  });
});
