// src/components/patch-management/cveRange.test.js

import { describe, it, expect } from "vitest";
import { affectedRangeLabel } from "./cveRange";

describe("affectedRangeLabel", () => {
  it("🔴 sin versiones NO dice «* → ∞»: eso se leía como «afecta a todas»", () => {
    // El caso de CVE-2026-40058: NVD lo publicó sin analizar, sin CPEs.
    expect(affectedRangeLabel({ introducedVersion: null, fixedVersion: null, affectedVersions: null })).toEqual({
      label: "No version data",
      unknown: true,
    });
    expect(affectedRangeLabel({})).toMatchObject({ unknown: true });
  });

  it("un rango normal se pinta como rango, con el lado abierto marcado", () => {
    expect(affectedRangeLabel({ introducedVersion: "21.00", fixedVersion: "23.00" })).toEqual({ label: "21.00 → 23.00", unknown: false });
    expect(affectedRangeLabel({ introducedVersion: null, fixedVersion: "23.00" })).toEqual({ label: "* → 23.00", unknown: false });
    expect(affectedRangeLabel({ introducedVersion: "21.00", fixedVersion: null })).toEqual({ label: "21.00 → ∞", unknown: false });
  });

  it("la enumeración exacta manda, y se recorta con el resto contado", () => {
    expect(affectedRangeLabel({ affectedVersions: ["1.0", "1.1"] })).toEqual({ label: "1.0, 1.1", unknown: false });
    expect(affectedRangeLabel({ affectedVersions: ["1.0", "1.1", "1.2", "1.3", "1.4"] }).label).toBe("1.0, 1.1, 1.2 +2 more");
  });

  it("⚠️ una enumeración de vacíos no cuenta como dato", () => {
    expect(affectedRangeLabel({ affectedVersions: ["", "  "] })).toMatchObject({ unknown: true });
  });
});
