// The bug this pins: useComplianceBands read `res.effective` while the
// endpoint returns `{ ok, settings: { effective, ... } }`. One level too
// shallow, so the hook silently returned DEFAULT_BANDS for its entire
// life and no tenant's configured thresholds ever coloured a score.
//
// It survived because the fallback is both silent and plausible. These
// assertions exist so the shape can never drift back unnoticed.

import { describe, it, expect } from "vitest";
import { readEffectiveBands } from "./useComplianceBands";

// The literal envelope from GET /api/v1/security/compliance/settings, as
// built by shapeView() in the backend's tenant-settings.service.
const REAL_RESPONSE = {
  ok: true,
  settings: {
    tenantId: "1",
    effective: {
      complianceMinChecks: 5,
      complianceBandGoodMin: 85,
      complianceBandWarningMin: 60,
    },
    overrides: {
      complianceMinChecks: null,
      complianceBandGoodMin: 85,
      complianceBandWarningMin: null,
    },
  },
};

describe("readEffectiveBands", () => {
  it("reads the effective block from the real envelope", () => {
    expect(readEffectiveBands(REAL_RESPONSE)).toEqual({
      complianceMinChecks: 5,
      complianceBandGoodMin: 85,
      complianceBandWarningMin: 60,
    });
  });

  it("does NOT read `effective` off the top level", () => {
    // Exactly the shape the old code assumed. If someone reintroduces
    // that path, this fails instead of quietly re-hiding the feature.
    const wrongShape = { ok: true, effective: { complianceBandGoodMin: 99 } };
    expect(readEffectiveBands(wrongShape)).toBeNull();
  });

  it("returns null for anything it cannot read, so the caller falls back", () => {
    expect(readEffectiveBands(null)).toBeNull();
    expect(readEffectiveBands(undefined)).toBeNull();
    expect(readEffectiveBands({})).toBeNull();
    expect(readEffectiveBands({ ok: true, settings: {} })).toBeNull();
  });
});
