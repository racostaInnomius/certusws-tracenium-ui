import { describe, it, expect } from "vitest";
import {
  REMEDIATION_TRANSITIONS,
  TERMINAL_TRANSITIONS_REQUIRING_NOTE,
  ackUntilIso,
  shortRelativeTime,
  shortDate,
} from "./complianceHelpers";

describe("REMEDIATION_TRANSITIONS", () => {
  it("open can move to every non-open state", () => {
    expect(REMEDIATION_TRANSITIONS.open).toEqual(["in_progress", "remediated", "risk_accepted", "wont_fix"]);
  });
  it("terminal states can only reopen", () => {
    expect(REMEDIATION_TRANSITIONS.remediated).toEqual(["open"]);
    expect(REMEDIATION_TRANSITIONS.wont_fix).toEqual(["open"]);
  });
});

describe("TERMINAL_TRANSITIONS_REQUIRING_NOTE", () => {
  it("flags risk_accepted and wont_fix", () => {
    expect(TERMINAL_TRANSITIONS_REQUIRING_NOTE.has("risk_accepted")).toBe(true);
    expect(TERMINAL_TRANSITIONS_REQUIRING_NOTE.has("wont_fix")).toBe(true);
    expect(TERMINAL_TRANSITIONS_REQUIRING_NOTE.has("remediated")).toBe(false);
  });
});

describe("ackUntilIso", () => {
  it("returns null for indefinite (null days)", () => {
    expect(ackUntilIso(null)).toBeNull();
  });
  it("returns an ISO instant ~N days out", () => {
    const iso = ackUntilIso(30);
    const deltaDays = (Date.parse(iso) - Date.now()) / 86_400_000;
    expect(deltaDays).toBeGreaterThan(29.9);
    expect(deltaDays).toBeLessThan(30.1);
  });
});

describe("shortRelativeTime", () => {
  it("returns null for invalid/empty", () => {
    expect(shortRelativeTime(null)).toBeNull();
    expect(shortRelativeTime("nope")).toBeNull();
  });
  it("buckets compactly without an 'ago' suffix", () => {
    const now = Date.now();
    expect(shortRelativeTime(new Date(now - 5 * 60_000).toISOString())).toBe("5m");
    expect(shortRelativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe("3h");
    expect(shortRelativeTime(new Date(now - 2 * 86_400_000).toISOString())).toBe("2d");
  });
});

describe("shortDate", () => {
  it("returns null for invalid/empty", () => {
    expect(shortDate(null)).toBeNull();
    expect(shortDate("bad")).toBeNull();
  });
  it("formats a month + day", () => {
    expect(shortDate("2026-09-30T00:00:00.000Z")).toMatch(/Sep/);
  });
});
