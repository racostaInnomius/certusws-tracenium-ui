// src/theme/scoreBands.test.js
//
// The score-band authority (Sprint 2 item 1). Pins the default scale
// (must mirror the backend's SYSTEM_DEFAULTS: 85/60), the boundary
// semantics (>= on both cuts) and the null gates, plus the
// effective-settings normalization that feeds it.

import { describe, it, expect } from "vitest";
import { BRAND, ROLE } from "./brand";
import {
  DEFAULT_BANDS,
  normalizeBands,
  scoreBandKey,
  scoreBandRole,
  scoreBandSoftRole,
  scoreBandTextRole,
  formatFleetScore,
} from "./scoreBands";

describe("DEFAULT_BANDS", () => {
  it("mirrors the backend SYSTEM_DEFAULTS (85/60)", () => {
    expect(DEFAULT_BANDS).toEqual({ goodMin: 85, warningMin: 60 });
  });
});

describe("scoreBandKey", () => {
  it("buckets on inclusive boundaries", () => {
    expect(scoreBandKey(100)).toBe("good");
    expect(scoreBandKey(85)).toBe("good");
    expect(scoreBandKey(84)).toBe("warning");
    expect(scoreBandKey(60)).toBe("warning");
    expect(scoreBandKey(59)).toBe("critical");
    expect(scoreBandKey(0)).toBe("critical");
  });

  it("null / undefined / NaN → null (unscored, never a band)", () => {
    expect(scoreBandKey(null)).toBeNull();
    expect(scoreBandKey(undefined)).toBeNull();
    expect(scoreBandKey("not a number")).toBeNull();
  });

  it("honors tenant-configured thresholds", () => {
    const bands = { goodMin: 95, warningMin: 80 };
    expect(scoreBandKey(90, bands)).toBe("warning");
    expect(scoreBandKey(95, bands)).toBe("good");
    expect(scoreBandKey(79, bands)).toBe("critical");
  });
});

describe("scoreBandRole / scoreBandSoftRole", () => {
  it("maps bands to ROLE tokens, null when unscored", () => {
    expect(scoreBandRole(90)).toBe(ROLE.positive);
    expect(scoreBandRole(70)).toBe(ROLE.caution);
    expect(scoreBandRole(10)).toBe(ROLE.critical);
    expect(scoreBandRole(null)).toBeNull();
    expect(scoreBandSoftRole(90)).toBe(ROLE.positiveSoft);
    expect(scoreBandSoftRole(null)).toBeNull();
  });
});

describe("normalizeBands", () => {
  it("reads the effective-settings field names", () => {
    expect(
      normalizeBands({ complianceBandGoodMin: 92, complianceBandWarningMin: 75 })
    ).toEqual({ goodMin: 92, warningMin: 75 });
  });

  it("falls back per-field on garbage or absence", () => {
    expect(normalizeBands(null)).toEqual(DEFAULT_BANDS);
    expect(normalizeBands({ complianceBandGoodMin: "nope" })).toEqual(DEFAULT_BANDS);
    expect(
      normalizeBands({ complianceBandGoodMin: 150, complianceBandWarningMin: 40 })
    ).toEqual({ goodMin: DEFAULT_BANDS.goodMin, warningMin: 40 });
  });
});

// scoreBandRole es relleno; el texto de una cifra o etiqueta de banda va con
// scoreBandTextRole, que tiene que leerse sobre blanco y sobre el tinte suave.
describe("scoreBandTextRole", () => {
  const rgb = (color) =>
    color.startsWith("#")
      ? { c: [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)), a: 1 }
      : (([r, g, b, a = 1]) => ({ c: [r, g, b], a }))(color.match(/[\d.]+/g).map(Number));
  const lum = (c) =>
    c
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (fg, bg) => {
    const { c, a } = rgb(bg);
    const [hi, lo] = [lum(rgb(fg).c), lum(c.map((v) => 255 - a * (255 - v)))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("maps bands to the text tokens, null when unscored", () => {
    expect(scoreBandTextRole(90)).toBe(BRAND.alert.successText);
    expect(scoreBandTextRole(70)).toBe(BRAND.alert.warningText);
    expect(scoreBandTextRole(10)).toBe(BRAND.alert.errorText);
    expect(scoreBandTextRole(null)).toBeNull();
    expect(scoreBandTextRole(50, { goodMin: 40, warningMin: 20 })).toBe(BRAND.alert.successText);
  });

  for (const score of [90, 70, 10]) {
    it(`score ${score}: el texto cumple AA sobre blanco y sobre su tinte`, () => {
      const fg = scoreBandTextRole(score);
      expect(ratio(fg, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      expect(ratio(fg, scoreBandSoftRole(score))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("formatFleetScore — la nota de flota, igual en todas partes", () => {
  it("⭐ un decimal y %: 18.1 no se convierte en 18 en un sitio y 18.1 en otro", () => {
    expect(formatFleetScore(18.1)).toBe("18.1%");
    expect(formatFleetScore(18.11)).toBe("18.1%");
    expect(formatFleetScore(20)).toBe("20.0%");
    // El rollup del MSP llega de un numeric(5,2) como texto.
    expect(formatFleetScore("34.40")).toBe("34.4%");
    expect(formatFleetScore(0)).toBe("0.0%");
  });
  it("sin nota, una raya — no un 0 ni «NaN%»", () => {
    expect(formatFleetScore(null)).toBe("—");
    expect(formatFleetScore(undefined)).toBe("—");
    expect(formatFleetScore("")).toBe("—");
  });
});
