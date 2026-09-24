import { describe, it, expect } from "vitest";
import { formatBytes, formatBytesToGb, formatCalendarDay, formatDate, formatRelative, EMPTY } from "./format";

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
  it("formats a valid ISO date in the compact default (2-digit, 24h)", () => {
    const out = formatDate("2026-05-26T10:00:00.000Z");
    expect(out).toMatch(/May/);
    expect(out).toMatch(/26/); // 2-digit year / day
    expect(out).not.toMatch(/2026/); // not the 4-digit year
  });
  it("honors explicit options (e.g. seconds)", () => {
    const out = formatDate("2026-05-26T10:00:05.000Z", {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    expect(out).toMatch(/2026/);
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

describe("formatCalendarDay", () => {
  it("⭐ pinta el día que mandó el equipo, sin correrlo por la zona horaria", () => {
    // new Date("2024-03-15") es medianoche UTC: en México saldría el 14.
    expect(formatCalendarDay("2024-03-15")).toBe("Mar 15, 2024");
    expect(formatCalendarDay("2024-01-01")).toBe("Jan 01, 2024");
  });
  it("vacío o inválido → EMPTY", () => {
    expect(formatCalendarDay(null)).toBe(EMPTY);
    expect(formatCalendarDay("2024-02-31")).toBe(EMPTY);
    expect(formatCalendarDay("2024-03-15T00:00:00Z")).toBe(EMPTY);
  });
});
