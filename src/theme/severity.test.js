import { describe, it, expect } from "vitest";
import { severityMeta, severityRank, SEVERITY_META } from "./severity";
import { BRAND } from "./brand";

describe("severityMeta — one scale everywhere", () => {
  it("maps each level to its canonical color (red→orange→amber→teal→gray)", () => {
    expect(severityMeta("critical").fg).toBe(BRAND.alert.error);
    expect(severityMeta("high").fg).toBe(BRAND.alert.high);       // orange, not red or amber
    expect(severityMeta("medium").fg).toBe(BRAND.alert.warningText); // amber, not teal
    expect(severityMeta("low").fg).toBe(BRAND.tealText);
    expect(severityMeta("info").fg).toBe(BRAND.gray);
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
