// src/theme/scoreBands.test.js
//
// The score-band authority (Sprint 2 item 1). Pins the default scale
// (must mirror the backend's SYSTEM_DEFAULTS: 85/60), the boundary
// semantics (>= on both cuts) and the null gates, plus the
// effective-settings normalization that feeds it.

import { describe, it, expect } from "vitest";
import { ROLE } from "./brand";
import {
  DEFAULT_BANDS,
  normalizeBands,
  scoreBandKey,
  scoreBandRole,
  scoreBandSoftRole,
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
