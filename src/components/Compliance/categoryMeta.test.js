// src/components/Compliance/categoryMeta.test.js
//
// The category names are our own vocabulary, so the label/description
// map is a product surface, not a formatting detail. These tests pin
// the two things that would silently break it: a new category seeded
// in the catalog blanking a row, and a description going missing so a
// tooltip opens onto nothing.

import { describe, it, expect } from "vitest";
import CATEGORY_META, { categoryLabel, categoryDescription } from "./categoryMeta";

// Every category that exists in the control-DB catalog as of
// 2026-09-01, after 20260827 (crypto → cryptography) and
// 20260901 (kernel_hardening → integrity).
const LIVE_CATEGORIES = [
  "identity_policy",
  "cryptography",
  "patching",
  "integrity",
  "network_sharing",
  "network_hardening",
  "firewall",
  "filesystem_hardening",
  "disk_encryption",
  "antimalware"
];

describe("categoryMeta", () => {
  it("covers every category the catalog currently ships", () => {
    for (const key of LIVE_CATEGORIES) {
      expect(CATEGORY_META[key], `missing meta for ${key}`).toBeTruthy();
    }
  });

  it("has no entry for the categories we merged away", () => {
    // Leaving these behind would keep a dead name explainable and
    // invite someone to reintroduce it.
    expect(CATEGORY_META.crypto).toBeUndefined();
    expect(CATEGORY_META.kernel_hardening).toBeUndefined();
  });

  it("gives every description enough substance to be worth a tooltip", () => {
    for (const key of LIVE_CATEGORIES) {
      const d = categoryDescription(key);
      expect(typeof d).toBe("string");
      // Long enough to name the question AND some concrete nouns —
      // "Encryption settings" would pass a truthiness check and fail
      // the operator.
      expect(d.length).toBeGreaterThan(40);
    }
  });

  it("falls back to the key rather than blanking an unknown category", () => {
    // A category seeded in the catalog before this map learns about it
    // must still render its row.
    expect(categoryLabel("supply_chain")).toBe("supply chain");
    expect(categoryDescription("supply_chain")).toBeNull();
  });

  it("labels an empty category rather than rendering nothing", () => {
    expect(categoryLabel("")).toBe("Uncategorized");
    expect(categoryLabel(null)).toBe("Uncategorized");
    expect(categoryLabel(undefined)).toBe("Uncategorized");
  });

  it("returns null (not an empty string) when there is nothing to say", () => {
    // Call sites branch on null to skip the tooltip entirely.
    expect(categoryDescription("")).toBeNull();
    expect(categoryDescription(null)).toBeNull();
  });
});
