// src/components/patch-management/timezoneOptions.test.js

import { describe, it, expect } from "vitest";
import { buildTimezoneOptions, matchTimezone, utcOffsetLabel, allTimezones } from "./timezoneOptions";

// A September day: US zones on daylight time.
const SEPT = new Date("2026-09-17T12:00:00Z");

describe("timezone options", () => {
  it("⭐ McAllen, TX is findable, and lands on America/Chicago (US Central)", () => {
    const opts = buildTimezoneOptions({ now: SEPT });
    const hits = opts.filter((o) => matchTimezone(o, "mcallen"));
    expect(hits.map((o) => o.value)).toEqual(["America/Chicago"]);
    expect(hits[0].label).toMatch(/^\(UTC−05:00\) America\/Chicago — /);
  });

  it("offers every zone the runtime knows, not eleven — and UTC", () => {
    const zones = allTimezones();
    expect(zones.length).toBeGreaterThan(300);
    expect(zones).toContain("UTC");
    expect(zones).toContain("America/Monterrey");
  });

  it("search ignores accents and case, and matches IANA names too", () => {
    const opts = buildTimezoneOptions({ now: SEPT });
    expect(opts.filter((o) => matchTimezone(o, "ciudad de mexico")).map((o) => o.value)).toContain("America/Mexico_City");
    expect(opts.filter((o) => matchTimezone(o, "sao paulo")).map((o) => o.value)).toContain("America/Sao_Paulo");
    expect(opts.filter((o) => matchTimezone(o, "europe/madrid")).map((o) => o.value)).toEqual(["Europe/Madrid"]);
  });

  it("⚠️ a zone already saved on a window stays in the list even if the browser doesn't know it", () => {
    const opts = buildTimezoneOptions({ now: SEPT, zones: ["UTC"], extra: "America/Chicago" });
    expect(opts.map((o) => o.value)).toEqual(["America/Chicago", "UTC"]);
  });

  it("sorted west to east by current offset", () => {
    const opts = buildTimezoneOptions({ now: SEPT, zones: ["Europe/Madrid", "UTC", "America/Chicago"] });
    expect(opts.map((o) => o.value)).toEqual(["America/Chicago", "UTC", "Europe/Madrid"]);
  });

  it("offset label", () => {
    expect(utcOffsetLabel("America/Chicago", SEPT)).toBe("UTC−05:00");
    expect(utcOffsetLabel("America/Chicago", new Date("2026-01-15T12:00:00Z"))).toBe("UTC−06:00");
    expect(utcOffsetLabel("UTC", SEPT)).toBe("UTC±00:00");
    expect(utcOffsetLabel("Asia/Kolkata", SEPT)).toBe("UTC+05:30");
  });
});
