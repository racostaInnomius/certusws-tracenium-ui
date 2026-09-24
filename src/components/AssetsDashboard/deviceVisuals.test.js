import { describe, it, expect } from "vitest";
import {
  DEVICE_DETAIL_TABS,
  DISK_WARN_PCT,
  batteryTone,
  diskTone,
  freeBytes,
  meterValue,
  versionTone,
} from "./deviceVisuals";

describe("DEVICE_DETAIL_TABS", () => {
  it("⭐ Agent primero y el resto en orden alfabético", () => {
    const labels = DEVICE_DETAIL_TABS.map((t) => t.label);
    expect(labels[0]).toBe("Agent");
    const rest = labels.slice(1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it("incluye Location y los valores no se repiten", () => {
    const values = DEVICE_DETAIL_TABS.map((t) => t.value);
    expect(values).toContain("location");
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("diskTone", () => {
  it("usa el mismo umbral que la lista de discos casi llenos (85 %)", () => {
    expect(DISK_WARN_PCT).toBe(85);
    expect(diskTone(84.9)).toBe("positive");
    expect(diskTone(85)).toBe("caution");
    expect(diskTone(95)).toBe("critical");
  });

  it("⚠️ sin medida es gris, no un disco vacío y sano", () => {
    expect(diskTone(null)).toBe("muted");
    expect(diskTone(undefined)).toBe("muted");
    expect(diskTone("")).toBe("muted");
  });
});

describe("batteryTone", () => {
  it("lo malo es que baje", () => {
    expect(batteryTone(80)).toBe("positive");
    expect(batteryTone(30)).toBe("caution");
    expect(batteryTone(10)).toBe("critical");
    expect(batteryTone(null)).toBe("muted");
  });
});

describe("meterValue / freeBytes", () => {
  it("acota a 0–100 y respeta la ausencia", () => {
    expect(meterValue(120)).toBe(100);
    expect(meterValue(-3)).toBe(0);
    expect(meterValue(null)).toBeNull();
  });

  it("libre = total − usado; null si falta un extremo", () => {
    expect(freeBytes(500, 450)).toBe(50);
    expect(freeBytes(500, null)).toBeNull();
    expect(freeBytes(0, 0)).toBeNull();
  });
});

describe("versionTone", () => {
  it("sin última versión conocida no opina", () => {
    expect(versionTone("current")).toBe("positive");
    expect(versionTone("one_behind")).toBe("caution");
    expect(versionTone("older")).toBe("critical");
    expect(versionTone("unknown")).toBe("muted");
  });
});
