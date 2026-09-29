import { describe, it, expect } from "vitest";
import { formatBytes, formatBytesToGb, formatCalendarDay, formatDate, formatDateSeconds, formatRelative, EMPTY } from "./format";
import { formatDetailDate } from "../components/AssetsDashboard/hostHelpers";

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
  it("⭐ this year's dates carry no year — «May 26, 26, 10:00» read as two days", () => {
    const out = formatDate("2026-05-26T10:00:00", undefined, new Date("2026-09-25T12:00:00"));
    expect(out).toBe("May 26, 10:00");
  });
  it("⭐ other years carry the FULL year, never two digits", () => {
    const out = formatDate("2025-12-03T09:10:00", undefined, new Date("2026-09-25T12:00:00"));
    expect(out).toBe("Dec 03, 2025, 09:10");
  });
  it("honors explicit options (e.g. seconds)", () => {
    const out = formatDate("2026-05-26T10:00:05.000Z", {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    expect(out).toMatch(/2026/);
  });
});

describe("formatDateSeconds — Audit y el detalle de un despliegue", () => {
  const now = new Date("2026-09-28T12:00:00");
  it("🔴 sin el año a dos cifras que tenían («Sep 28, 26, 16:44:03»)", () => {
    expect(formatDateSeconds("2026-09-28T16:44:03", now)).toBe("Sep 28, 16:44:03");
    expect(formatDateSeconds("2025-12-03T09:10:07", now)).toBe("Dec 03, 2025, 09:10:07");
  });
  it("vacío o inválido → EMPTY (Audit pintaba «Invalid Date»)", () => {
    expect(formatDateSeconds(null, now)).toBe(EMPTY);
    expect(formatDateSeconds("bad", now)).toBe(EMPTY);
  });
});

describe("formatDetailDate — la ficha del equipo en Assets", () => {
  it("🔴 pasa por el formateador común: nada de «Sep 28, 26, 16:44»", () => {
    const thisYear = new Date().getFullYear();
    expect(formatDetailDate(`${thisYear}-09-28T16:44:00`)).toBe("Sep 28, 16:44");
    expect(formatDetailDate(`${thisYear - 1}-09-28T16:44:00`)).toBe(`Sep 28, ${thisYear - 1}, 16:44`);
    expect(formatDetailDate(null)).toBe(EMPTY);
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
