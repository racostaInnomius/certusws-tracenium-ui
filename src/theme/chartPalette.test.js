import { describe, it, expect } from "vitest";
import {
  CHART_SERIES,
  CHART_SERIES_WIDE,
  CHART_CATEGORICAL,
  CHART_NEUTRAL,
} from "./chartPalette";
import { BRAND } from "./brand";

// These assertions pin the *rendered* colors to the exact values the charts
// used before they were tokenized, so the refactor is provably a no-op on
// screen. If a palette entry legitimately changes, update the literal here on
// purpose — that's the point of pinning it.
describe("chart palettes are unchanged by tokenization", () => {
  it("CHART_SERIES matches the old duplicated BAR_COLORS", () => {
    expect(CHART_SERIES).toEqual(["#5A9F9F", "#3E7878", "#52B788", "#B9E3D0"]);
  });

  it("CHART_SERIES_WIDE matches the old donut COLORS", () => {
    expect(CHART_SERIES_WIDE).toEqual(["#5A9F9F", "#3E7878", "#52B788", "#86C6A8", "#B9E3D0"]);
  });

  it("CHART_CATEGORICAL matches the old FW_COLORS", () => {
    expect(CHART_CATEGORICAL).toEqual([
      "#5A9F9F",
      "#6B7FD7",
      "#D78B3E",
      "#3B404D",
      "#52B788",
      "#C05E9E",
      "#8FBF3F",
    ]);
  });

  it("CHART_NEUTRAL matches the old Other/Unknown grays", () => {
    expect(CHART_NEUTRAL).toEqual({ other: "#A8B0B5", unknown: "#D0D5D8" });
  });
});

// The whole reason this module exists: brand colors used to be re-typed as hex
// inside each chart, so a brand change would silently skip them. These bind the
// palettes to BRAND so that drift can't come back.
describe("brand-derived entries reference BRAND (no drift)", () => {
  it("the bar/donut ramps start with the brand teal and teal-text", () => {
    expect(CHART_SERIES[0]).toBe(BRAND.teal);
    expect(CHART_SERIES[1]).toBe(BRAND.tealText);
    expect(CHART_SERIES_WIDE[0]).toBe(BRAND.teal);
    expect(CHART_SERIES_WIDE[1]).toBe(BRAND.tealText);
  });

  it("the categorical ramp reuses brand teal and dark", () => {
    expect(CHART_CATEGORICAL[0]).toBe(BRAND.teal);
    expect(CHART_CATEGORICAL[3]).toBe(BRAND.dark);
  });
});

describe("palette shape", () => {
  it("every entry is a usable CSS color string", () => {
    const all = [...CHART_SERIES, ...CHART_SERIES_WIDE, ...CHART_CATEGORICAL, ...Object.values(CHART_NEUTRAL)];
    for (const c of all) {
      expect(typeof c, `not a string: ${c}`).toBe("string");
      expect(c, `not a hex color: ${c}`).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });

  it("no duplicate colors within a single palette", () => {
    for (const [name, palette] of Object.entries({ CHART_SERIES, CHART_SERIES_WIDE, CHART_CATEGORICAL })) {
      expect(new Set(palette).size, `${name} has duplicate entries`).toBe(palette.length);
    }
  });
});
