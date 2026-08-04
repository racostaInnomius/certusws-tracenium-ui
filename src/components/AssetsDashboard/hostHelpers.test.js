import { describe, it, expect } from "vitest";
import {
  compareVersions,
  bucketOfVersion,
  toSafeNumber,
  formatOperatingMode,
  storageHealthColor,
  getOsVersionDisplayTitle,
  getOsVersionDisplaySubtitle,
  formatDetailValue,
  formatDetailDate,
  formatDetailPercent,
  coalesceValue,
  normalizeHostRow,
  buildHostsQuery,
  getHostDeviceId,
  getHostDisplayName,
  isDeviceTerminalOrPendingDeletion,
  isDecommissionJobTerminal,
  getDecommissionErrorMessage,
  normalizeHostDetailPayload,
  normalizeHardwareDetailPayload,
  formatLocationLabel,
} from "./hostHelpers";
import { ROLE } from "../../theme/brand";

describe("compareVersions", () => {
  it("returns the -1/0/1 trichotomy, tolerating non-numeric segments", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("2.0", "2.0.0")).toBe(0);
    expect(compareVersions("1.x", "1.0")).toBe(0);
  });
});

describe("bucketOfVersion", () => {
  it("classifies current / one_behind / older / unknown", () => {
    expect(bucketOfVersion("1.2.5", "1.2.3")).toBe("current"); // ahead counts as current
    expect(bucketOfVersion("1.2.3", "1.2.3")).toBe("current");
    expect(bucketOfVersion("1.2.1", "1.2.3")).toBe("one_behind"); // same major.minor, patch within 2
    expect(bucketOfVersion("1.1.0", "1.2.3")).toBe("older");
    expect(bucketOfVersion("", "1.2.3")).toBe("unknown");
    expect(bucketOfVersion("1.0.0", "")).toBe("unknown");
  });
});

describe("toSafeNumber", () => {
  it("returns finite numbers or 0", () => {
    expect(toSafeNumber("42")).toBe(42);
    expect(toSafeNumber("nope")).toBe(0);
    expect(toSafeNumber(null)).toBe(0);
  });
});

describe("formatOperatingMode", () => {
  it("maps known modes and passes unknowns/empties through", () => {
    expect(formatOperatingMode("mdmMam")).toMatch(/fully managed/);
    expect(formatOperatingMode("weird")).toBe("weird");
    expect(formatOperatingMode("")).toBe("—");
  });
});

describe("storageHealthColor", () => {
  it("maps health buckets to theme colors", () => {
    expect(storageHealthColor("ok")).toBe(ROLE.positive);
    expect(storageHealthColor("healthy")).toBe(ROLE.positive);
    expect(storageHealthColor("critical")).toBe(ROLE.critical);
    expect(storageHealthColor("low")).toBe("#B07818");
  });
});

describe("os version display", () => {
  it("prefers display fields then falls back", () => {
    expect(getOsVersionDisplayTitle({ commercial_name: "Windows 11" })).toBe("Windows 11");
    expect(getOsVersionDisplayTitle({})).toBe("Unknown OS");
    expect(getOsVersionDisplaySubtitle({ os_version: "23H2" })).toBe("23H2");
    expect(getOsVersionDisplaySubtitle({})).toBe("");
  });
});

describe("detail formatters", () => {
  it("formatDetailValue falls back for null/blank", () => {
    expect(formatDetailValue("  x ")).toBe("x");
    expect(formatDetailValue("")).toBe("—");
    expect(formatDetailValue(null, "n/a")).toBe("n/a");
  });
  it("formatDetailDate returns em-dash for invalid, a string otherwise", () => {
    expect(formatDetailDate(null)).toBe("—");
    expect(formatDetailDate("not-a-date")).toBe("—");
    expect(typeof formatDetailDate("2026-05-01T10:00:00Z")).toBe("string");
  });
  it("formatDetailPercent fixes to one decimal", () => {
    expect(formatDetailPercent(12.345)).toBe("12.3%");
    expect(formatDetailPercent("nope")).toBe("—");
  });
});

describe("coalesceValue", () => {
  it("returns the first non-empty value", () => {
    expect(coalesceValue(null, "", "  ", "hit", "next")).toBe("hit");
    expect(coalesceValue(null, undefined)).toBeUndefined();
  });
});

describe("normalizeHostRow", () => {
  it("folds snake_case and camelCase into both shapes", () => {
    const row = normalizeHostRow({ agent_id: "a1", hostname: "h1", os_platform: "windows" });
    expect(row.agentId).toBe("a1");
    expect(row.agent_id).toBe("a1");
    expect(row.osPlatform).toBe("windows");
    expect(row.os_platform).toBe("windows");
  });
});

describe("buildHostsQuery", () => {
  it("builds a 1-indexed paged query, gating short searches and whitelisting sort", () => {
    const qs = buildHostsQuery({ page: 2, pageSize: 25, search: "ab", sortBy: "bogus", sortDir: "desc" });
    const p = new URLSearchParams(qs);
    expect(p.get("page")).toBe("3");
    expect(p.get("pageSize")).toBe("25");
    expect(p.get("search")).toBeNull(); // "ab" < 3 chars
    expect(p.get("sortBy")).toBe("hostname"); // bogus → default
    expect(p.get("sortDir")).toBe("desc");

    const qs2 = buildHostsQuery({ page: 0, pageSize: 10, search: "abc", sortBy: "manufacturer", sortDir: "asc" });
    const p2 = new URLSearchParams(qs2);
    expect(p2.get("search")).toBe("abc");
    expect(p2.get("sortBy")).toBe("manufacturer");
  });
});

describe("host identity", () => {
  it("getHostDeviceId / getHostDisplayName resolve across shapes", () => {
    expect(getHostDeviceId({ device_id: "d1" })).toBe("d1");
    expect(getHostDisplayName({ deviceName: "dn" })).toBe("dn");
    expect(getHostDisplayName({ agent_id: "a1" })).toBe("a1"); // falls back to id
  });
});

describe("device lifecycle", () => {
  it("isDeviceTerminalOrPendingDeletion detects terminal/pending states", () => {
    expect(isDeviceTerminalOrPendingDeletion({ status: "decommissioned" })).toBe(true);
    expect(isDeviceTerminalOrPendingDeletion({ status: "active" })).toBe(false);
  });
  it("isDecommissionJobTerminal detects terminal job states", () => {
    expect(isDecommissionJobTerminal("completed")).toBe(true);
    expect(isDecommissionJobTerminal("RUNNING")).toBe(false);
  });
});

describe("normalizeHostDetailPayload", () => {
  it("unwraps the agent/host/item envelope and folds field variants", () => {
    const out = normalizeHostDetailPayload({ agent: { agent_id: "a1", host: "h1", os_platform: "linux" } });
    expect(out.agentId).toBe("a1");
    expect(out.hostname).toBe("h1");
    expect(out.platform).toBe("linux");
  });
  it("falls back to the row already in the table", () => {
    const out = normalizeHostDetailPayload({}, { agent_id: "fb", hostname: "fbhost", os_version: "22.04" });
    expect(out.agentId).toBe("fb");
    expect(out.hostname).toBe("fbhost");
    expect(out.os).toBe("22.04");
  });
  it("detects mobile devices from either the boolean or the 'true' string", () => {
    expect(normalizeHostDetailPayload({ mobile: true }).isMobile).toBe(true);
    expect(normalizeHostDetailPayload({ mobile: "true" }).isMobile).toBe(true);
    expect(normalizeHostDetailPayload({}).isMobile).toBe(false);
  });
});

describe("normalizeHardwareDetailPayload", () => {
  it("prefers the item matching the agent id", () => {
    const payload = { items: [{ agent_id: "other" }, { agentId: "a1", cpu: "x" }] };
    expect(normalizeHardwareDetailPayload(payload, "a1")).toEqual({ agentId: "a1", cpu: "x" });
  });
  it("falls back to the first item, or null when empty", () => {
    expect(normalizeHardwareDetailPayload({ items: [{ agent_id: "z" }] }, "nope")).toEqual({ agent_id: "z" });
    expect(normalizeHardwareDetailPayload({ items: [] }, "a1")).toBeNull();
    expect(normalizeHardwareDetailPayload(null, "a1")).toBeNull();
  });
  it("accepts a bare array payload", () => {
    expect(normalizeHardwareDetailPayload([{ agentId: "a1" }], "a1")).toEqual({ agentId: "a1" });
  });
});

describe("getDecommissionErrorMessage", () => {
  it("maps known error codes and falls back to body/message", () => {
    expect(getDecommissionErrorMessage({ body: { error: "FORBIDDEN" } })).toMatch(/permission/i);
    expect(getDecommissionErrorMessage({ body: { message: "boom" } })).toBe("boom");
    expect(getDecommissionErrorMessage({})).toMatch(/Unable to start/);
  });
});

describe("device location (AMP Phase 1)", () => {
  it("folds the location fields and always yields an array history", () => {
    const out = normalizeHostDetailPayload({
      locationKey: "subnet:10.20.30.0/24",
      locationSource: "subnet",
      locationSubnet: "10.20.30.0/24",
      locationHistory: [{ locationKey: "subnet:10.20.30.0/24", hitCount: 4 }],
    });
    expect(out.locationKey).toBe("subnet:10.20.30.0/24");
    expect(out.locationSource).toBe("subnet");
    expect(out.locationSubnet).toBe("10.20.30.0/24");
    expect(out.locationHistory).toHaveLength(1);
  });

  it("defaults history to [] when the device has no fix", () => {
    expect(normalizeHostDetailPayload({}).locationHistory).toEqual([]);
    // Junk from a drifted backend must not become the history either.
    expect(normalizeHostDetailPayload({ locationHistory: "nope" }).locationHistory).toEqual([]);
  });

  it("formatLocationLabel prefers site, then city, then the raw subnet", () => {
    expect(
      formatLocationLabel({ locationSite: "Oficina CDMX", locationCity: "CDMX", locationSubnet: "10.20.30.0/24" })
    ).toBe("Oficina CDMX");
    expect(formatLocationLabel({ locationCity: "CDMX", locationSubnet: "10.20.30.0/24" })).toBe("CDMX");
    expect(formatLocationLabel({ locationSubnet: "10.20.30.0/24" })).toBe("10.20.30.0/24");
  });

  it("formatLocationLabel returns an em-dash when there is no fix", () => {
    expect(formatLocationLabel({})).toBe("—");
    expect(formatLocationLabel(null)).toBe("—");
  });
});
