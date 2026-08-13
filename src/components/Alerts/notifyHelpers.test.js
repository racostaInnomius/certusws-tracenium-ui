import { describe, it, expect } from "vitest";
import { parseRecipients, validateRecipients, MAX_RECIPIENTS } from "./notifyHelpers";

describe("parseRecipients", () => {
  it("accepts the three separators operators actually paste", () => {
    expect(parseRecipients("a@x.com\nb@x.com, c@x.com; d@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });

  it("trims, lowercases and drops blanks", () => {
    expect(parseRecipients("  OPS@Example.COM \n\n , ;  ")).toEqual(["ops@example.com"]);
  });

  it("returns [] for non-strings", () => {
    expect(parseRecipients(null)).toEqual([]);
    expect(parseRecipients(42)).toEqual([]);
  });
});

describe("validateRecipients", () => {
  it("passes a clean list", () => {
    const r = validateRecipients(["ops@example.com", "sec@example.com"]);
    expect(r.ok).toBe(true);
    expect(r.invalid).toEqual([]);
    expect(r.unique).toHaveLength(2);
  });

  it("reports malformed addresses instead of quietly dropping them", () => {
    // Silently dropping is exactly how a rule ends up looking configured
    // and never delivering.
    const r = validateRecipients(["ops@example.com", "not-an-email", "no@tld"]);
    expect(r.ok).toBe(false);
    expect(r.invalid).toEqual(["not-an-email", "no@tld"]);
  });

  it("dedupes without treating duplicates as an error", () => {
    const r = validateRecipients(["a@x.com", "a@x.com"]);
    expect(r.ok).toBe(true);
    expect(r.unique).toEqual(["a@x.com"]);
  });

  it("flags going over the recipient cap", () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `u${i}@x.com`);
    const r = validateRecipients(many);
    expect(r.overCap).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("allows exactly the cap", () => {
    const exactly = Array.from({ length: MAX_RECIPIENTS }, (_, i) => `u${i}@x.com`);
    expect(validateRecipients(exactly).ok).toBe(true);
  });

  it("treats an empty list as valid — that is how delivery is turned off", () => {
    const r = validateRecipients([]);
    expect(r.ok).toBe(true);
    expect(r.unique).toEqual([]);
  });

  it("survives junk input", () => {
    expect(validateRecipients(null).ok).toBe(true);
    expect(validateRecipients(undefined).unique).toEqual([]);
  });
});
