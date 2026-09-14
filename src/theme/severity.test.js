import { describe, it, expect } from "vitest";
import { severityMeta, severityRank, SEVERITY_META } from "./severity";
import { BRAND, TEXT_MUTED } from "./brand";

describe("severityMeta — one scale everywhere", () => {
  it("maps each level to its canonical color (red→orange→amber→teal→gray)", () => {
    expect(severityMeta("critical").fg).toBe(BRAND.alert.errorText);
    expect(severityMeta("high").fg).toBe(BRAND.alert.high);       // orange, not red or amber
    expect(severityMeta("medium").fg).toBe(BRAND.alert.warningText); // amber, not teal
    expect(severityMeta("low").fg).toBe(BRAND.alert.infoText);
    expect(severityMeta("info").fg).toBe(TEXT_MUTED);
  });

  it("High is orange and Medium is amber — the previously-divergent cases", () => {
    // High must NOT be red (critical) or amber (medium).
    expect(severityMeta("high").fg).not.toBe(severityMeta("critical").fg);
    expect(severityMeta("high").fg).not.toBe(severityMeta("medium").fg);
    // Medium must NOT be teal (the brand "OK" color) — that was the misleading bug.
    expect(severityMeta("medium").fg).not.toBe(BRAND.teal);
    expect(severityMeta("medium").fg).not.toBe(BRAND.tealText);
  });

  it("is case-insensitive and resolves aliases", () => {
    expect(severityMeta("HIGH")).toBe(SEVERITY_META.high);
    expect(severityMeta("warning")).toBe(SEVERITY_META.medium);
    expect(severityMeta("moderate")).toBe(SEVERITY_META.medium);
    expect(severityMeta("informational")).toBe(SEVERITY_META.info);
  });

  it("falls back to 'none' for unknown/empty", () => {
    expect(severityMeta("")).toBe(SEVERITY_META.none);
    expect(severityMeta(null)).toBe(SEVERITY_META.none);
    expect(severityMeta("bogus")).toBe(SEVERITY_META.none);
  });

  it("ranks by severity for sorting", () => {
    expect(severityRank("critical")).toBeGreaterThan(severityRank("high"));
    expect(severityRank("high")).toBeGreaterThan(severityRank("medium"));
    expect(severityRank("medium")).toBeGreaterThan(severityRank("low"));
  });
});

// `fg` es la letra de los chips de severidad. El fondo es translúcido, así que
// el contraste se mide contra el `bg` compuesto sobre blanco, no contra blanco.
describe("severityMeta — contraste del texto", () => {
  const channels = (color) =>
    color.startsWith("#")
      ? { c: [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)), a: 1 }
      : (([r, g, b, a = 1]) => ({ c: [r, g, b], a }))(color.match(/[\d.]+/g).map(Number));
  const lum = (c) =>
    c
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (fg, bg) => {
    const { c, a } = channels(bg);
    const [hi, lo] = [lum(channels(fg).c), lum(c.map((v) => 255 - a * (255 - v)))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const [level, { fg, bg }] of Object.entries(SEVERITY_META)) {
    it(`${level}: cumple AA (4,5:1) sobre su fondo`, () => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
