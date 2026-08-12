import { describe, it, expect } from "vitest";
import { BRAND } from "./brand";

// `errorHover` was extracted from two hardcoded `#991b1b` hovers (the
// Decommission dialog's Delete button and the HostsTable delete action).
// Pinning the literal proves that tokenization rendered identically; if the
// destructive shade is ever re-tuned, update this on purpose.
describe("BRAND.alert destructive tokens", () => {
  it("errorHover keeps the exact shade the two call sites used", () => {
    expect(BRAND.alert.errorHover).toBe("#991b1b");
  });

  it("errorHover is a distinct, darker shade than the resting error fill", () => {
    expect(BRAND.alert.errorHover).not.toBe(BRAND.alert.error);

    const luminance = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // A solid destructive button rests on a soft red, so the hover has to be
    // clearly darker or it reads as no feedback at all.
    expect(luminance(BRAND.alert.errorHover)).toBeLessThan(luminance(BRAND.alert.error));
  });
});
