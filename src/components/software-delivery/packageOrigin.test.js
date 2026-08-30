// src/components/software-delivery/packageOrigin.test.js
//
// The provenance signal. Getting this backwards is the expensive direction:
// a package that was never analysed would render as if it had been, which is
// exactly the false assurance the badge exists to remove.

import { describe, it, expect } from "vitest";
import { isVerifiedPackage, originLabel } from "./packageOrigin";

describe("isVerifiedPackage", () => {
  // Approving an intake writes `blob:<name>`; nothing else can produce it, so
  // the prefix IS the provenance.
  it("recognises the managed blob reference an approved intake writes", () => {
    expect(isVerifiedPackage({ downloadPath: "blob:intake/111/4800de/agent.msi" })).toBe(true);
  });

  it("accepts a bare path as well as a package, because both callers exist", () => {
    expect(isVerifiedPackage("blob:intake/111/x.msi")).toBe(true);
    expect(isVerifiedPackage("https://vendor.example/x.msi")).toBe(false);
  });

  it("treats an https URL as unverified — that is the typed-in path", () => {
    expect(isVerifiedPackage({ downloadPath: "https://vendor.example/setup.exe" })).toBe(false);
  });

  // The dialog trims before storing, and a stray space must not flip provenance.
  it("ignores surrounding whitespace and case", () => {
    expect(isVerifiedPackage({ downloadPath: "  blob:intake/x  " })).toBe(true);
    expect(isVerifiedPackage({ downloadPath: "BLOB:intake/x" })).toBe(true);
  });

  // ⚠️ Fails CLOSED. Missing data must read as "we did not verify this", never
  // as "verified" — the badge is a claim about what we checked.
  it("calls anything it cannot read unverified", () => {
    expect(isVerifiedPackage(null)).toBe(false);
    expect(isVerifiedPackage(undefined)).toBe(false);
    expect(isVerifiedPackage({})).toBe(false);
    expect(isVerifiedPackage({ downloadPath: null })).toBe(false);
    expect(isVerifiedPackage({ downloadPath: "" })).toBe(false);
  });

  // A URL that merely mentions the word is not a managed reference.
  it("is not fooled by a path that only contains the word", () => {
    expect(isVerifiedPackage({ downloadPath: "https://x.example/blob:/setup.msi" })).toBe(false);
    expect(isVerifiedPackage({ downloadPath: "https://blob.core.windows.net/x.msi" })).toBe(false);
  });
});

describe("originLabel", () => {
  it("states what was done, not how good the file is", () => {
    expect(originLabel({ downloadPath: "blob:intake/x" })).toBe("Analyzed");
    expect(originLabel({ downloadPath: "https://vendor.example/x.msi" })).toBe("Unverified");
  });
});
