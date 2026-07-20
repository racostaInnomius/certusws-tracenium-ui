import { describe, it, expect } from "vitest";
import { formatBytes, formatBytesToGb, formatDate, formatRelative, EMPTY } from "./format";

describe("formatBytes", () => {
  it("auto-scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
  it("returns EMPTY for invalid/negative", () => {
    expect(formatBytes(null)).toBe(EMPTY);
    expect(formatBytes(-1)).toBe(EMPTY);
    expect(formatBytes("nope")).toBe(EMPTY);
  });
});

describe("formatBytesToGb", () => {
  it("formats GB with one decimal", () => {
    expect(formatBytesToGb(512 * 1024 ** 3)).toBe("512.0 GB");
  });
  it("canonicalizes missing to EMPTY (not '0 GB')", () => {
    expect(formatBytesToGb(0)).toBe(EMPTY);
    expect(formatBytesToGb(null)).toBe(EMPTY);
    expect(formatBytesToGb(undefined)).toBe(EMPTY);
  });
});

describe("formatDate", () => {
  it("returns EMPTY for empty/invalid", () => {
    expect(formatDate(null)).toBe(EMPTY);
    expect(formatDate("not-a-date")).toBe(EMPTY);
  });
  it("formats a valid ISO date", () => {
    expect(formatDate("2026-05-26T10:00:00.000Z")).toMatch(/2026/);
  });
});

describe("formatRelative", () => {
  it("returns EMPTY for empty/invalid", () => {
    expect(formatRelative(null)).toBe(EMPTY);
    expect(formatRelative("bad")).toBe(EMPTY);
  });
  it("buckets recent times", () => {
    const now = new Date();
    expect(formatRelative(new Date(now.getTime() - 10 * 1000).toISOString())).toBe("just now");
    expect(formatRelative(new Date(now.getTime() - 5 * 60 * 1000).toISOString())).toBe("5m ago");
    expect(formatRelative(new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString())).toBe("3h ago");
    expect(formatRelative(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString())).toBe("2d ago");
  });
});
