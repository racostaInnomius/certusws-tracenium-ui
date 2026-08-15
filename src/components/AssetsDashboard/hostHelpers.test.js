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
  formatCoordinates,
  getMapPin,
  getLocationHint,
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

  it("formatLocationLabel prefers the operator's site, then the raw subnet", () => {
    // The site name is human-entered and exact; the subnet is at least true.
    expect(
      formatLocationLabel({ locationSite: "Oficina CDMX", locationSubnet: "10.20.30.0/24" })
    ).toBe("Oficina CDMX");
    expect(formatLocationLabel({ locationSubnet: "10.20.30.0/24" })).toBe("10.20.30.0/24");
  });

  it("shows the city an operator DECLARED for the range", () => {
    // locationCity comes from the site mapping — a human who knows the network
    // wrote it down, so it is exact by construction.
    expect(formatLocationLabel({ locationCity: "Ciudad de México" })).toBe("Ciudad de México");
    // The site name still wins: it is more specific than the city.
    expect(
      formatLocationLabel({ locationSite: "Oficina Reforma", locationCity: "Ciudad de México" })
    ).toBe("Oficina Reforma");
  });

  it("NEVER reports the IP-derived city as the device's location", () => {
    // Measured on real hosts: a house in Avandaro resolved to Chicago and a
    // device to Montreal, because both egress through a Starlink gateway. The
    // IP genuinely belongs to that PoP, so this is not fixable with a fresher
    // dataset — the city simply is not where the machine is. It travels in its
    // own field (locationIpCity) precisely so it can never be mistaken for one.
    expect(formatLocationLabel({ locationIpCity: "Montreal", locationCountry: "CA" })).toBe("\u2014");
    expect(
      formatLocationLabel({ locationIpCity: "Chicago", locationSubnet: "10.20.30.0/24" })
    ).toBe("10.20.30.0/24");
  });

  it("formatLocationLabel still returns the em-dash when nothing is known", () => {
    expect(formatLocationLabel({})).toBe("\u2014");
    expect(formatLocationLabel(null)).toBe("\u2014");
  });

  it("formatLocationLabel returns an em-dash when there is no fix", () => {
    expect(formatLocationLabel({})).toBe("—");
    expect(formatLocationLabel(null)).toBe("—");
  });
});

describe("formatCoordinates (Phase 2, mobile GPS)", () => {
  it("renders a pasteable coordinate pair with accuracy", () => {
    expect(
      formatCoordinates({ locationLat: 20.673611, locationLon: -103.343611, locationAccuracyM: 12 })
    ).toBe("20.67361, -103.34361 ±12 m");
  });

  it("omits accuracy when it is absent or unusable", () => {
    expect(formatCoordinates({ locationLat: 20.6736, locationLon: -103.3436 })).toBe("20.67360, -103.34360");
    expect(
      formatCoordinates({ locationLat: 20.6736, locationLon: -103.3436, locationAccuracyM: 0 })
    ).toBe("20.67360, -103.34360");
  });

  it("returns empty for desktop rows so the field can be omitted entirely", () => {
    // Desktop fixes never carry coordinates — an em-dash would imply we tried.
    expect(formatCoordinates({ locationSubnet: "10.20.30.0/24" })).toBe("");
    expect(formatCoordinates({})).toBe("");
    expect(formatCoordinates(null)).toBe("");
  });

  it("treats an explicit null as 'no fix', not as zero", () => {
    // REGRESSION: Number(null) is 0 and passes Number.isFinite, so coercing
    // straight from the payload rendered "0.00000, 0.00000" — Null Island —
    // on every desktop device. The absent-key cases above did not catch it
    // because Number(undefined) is NaN.
    expect(formatCoordinates({ locationLat: null, locationLon: null })).toBe("");
    expect(formatCoordinates({ locationLat: null, locationLon: -103.34 })).toBe("");
    expect(formatCoordinates({ locationLat: 20.67, locationLon: null })).toBe("");
    expect(formatCoordinates({ locationLat: "", locationLon: "" })).toBe("");
  });

  it("returns empty for a normalized desktop payload — the shape the UI actually gets", () => {
    // normalizeHostDetailPayload coerces every missing location field to null,
    // so this is the real production input, not the hand-written {} above.
    const profile = normalizeHostDetailPayload({ profile: { localIp: "10.20.30.41" } })?.profile;
    expect(formatCoordinates(profile)).toBe("");
  });

  it("still renders a genuine zero latitude on the equator", () => {
    // The fix is about null-ness, not about the digit 0: (0, lon) is a real
    // place. The backend rejects only the (0,0) pair, at ingest.
    expect(formatCoordinates({ locationLat: 0, locationLon: 32.5 })).toBe("0.00000, 32.50000");
  });

  it("ignores a null accuracy instead of printing ±0 m", () => {
    expect(
      formatCoordinates({ locationLat: 20.6736, locationLon: -103.3436, locationAccuracyM: null })
    ).toBe("20.67360, -103.34360");
  });
});

describe("getMapPin", () => {
  it("returns a gps pin, with its accuracy radius, when the device reported one", () => {
    expect(
      getMapPin({
        locationMapLat: 20.6736,
        locationMapLon: -103.3436,
        locationMapSource: "gps",
        locationAccuracyM: 25,
      })
    ).toMatchObject({ lat: 20.6736, lon: -103.3436, source: "gps", accuracyM: 25 });
  });

  it("returns a site pin WITHOUT an accuracy radius", () => {
    // A site pin is a whole network's nominal spot; drawing a radius around it
    // would imply a measurement nobody took.
    const pin = getMapPin({
      locationMapLat: 19.4326,
      locationMapLon: -99.1332,
      locationMapSource: "site",
      locationAccuracyM: 25,
    });
    expect(pin.source).toBe("site");
    expect(pin.accuracyM).toBeNull();
  });

  it("returns null when there is nothing to plot", () => {
    // Same null-vs-zero trap as formatCoordinates: the API sends explicit nulls.
    expect(getMapPin({ locationMapLat: null, locationMapLon: null })).toBeNull();
    expect(getMapPin({})).toBeNull();
    expect(getMapPin(null)).toBeNull();
    expect(getMapPin({ locationMapLat: 20.67, locationMapLon: null })).toBeNull();
  });

  it("defaults an unknown source to 'site', the weaker claim", () => {
    const pin = getMapPin({ locationMapLat: 20.67, locationMapLon: -103.34 });
    expect(pin.source).toBe("site");
  });

  it("carries the label so the map does not have to re-derive it", () => {
    const pin = getMapPin({
      locationMapLat: 19.4326,
      locationMapLon: -99.1332,
      locationMapSource: "site",
      locationSite: "Oficina Reforma",
    });
    expect(pin.label).toBe("Oficina Reforma");
  });
});

describe("getLocationHint", () => {
  it("reports the reason the AGENT gave, not one we inferred", () => {
    // The whole point for an MSP: four blank Location fields across five
    // clients' fleets are four different problems, and only some need action.
    expect(getLocationHint({ locationStatus: "disabled" })).toMatch(/off for this tenant/i);
    expect(getLocationHint({ locationStatus: "unsupported" })).toMatch(/no system location service/i);
    expect(getLocationHint({ locationStatus: "denied" })).toMatch(/refused|declined/i);
    expect(getLocationHint({ locationStatus: "unavailable" })).toMatch(/not produced a fix/i);
    // Las tres formas de "sin posición" en macOS tienen que leerse distinto:
    // una no es un fallo, la otra sí, y la tercera es esperar.
    expect(getLocationHint({ locationStatus: "no_user_session" })).toMatch(/nobody is signed in/i);
    expect(getLocationHint({ locationStatus: "agent_not_publishing" })).toMatch(/not reporting/i);
    // Que el rechazo se lea como decisión deliberada, no como falla.
    expect(getLocationHint({ locationStatus: "ip_derived_rejected" })).toMatch(/where the traffic exits/i);
    // consent_required must NOT read like "wait a bit longer": nobody has
    // answered the OS prompt, so waiting resolves nothing.
    expect(getLocationHint({ locationStatus: "consent_required" })).toMatch(/System Settings/i);
    expect(getLocationHint({ locationStatus: "consent_required" })).not.toMatch(/not produced a fix/i);
  });

  it("passes through a reason this build has never heard of", () => {
    // The agent ships independently and will invent new reasons. Showing the
    // raw value beats showing nothing.
    expect(getLocationHint({ locationStatus: "airplane_mode" })).toMatch(/airplane_mode/);
  });

  it("prefers the agent's reason over the subnet fallback text", () => {
    expect(
      getLocationHint({ locationStatus: "denied", locationSubnet: "192.168.1.0/24" })
    ).toMatch(/refused|declined/i);
  });

  it("says the agent is too old when it reported no status at all", () => {
    // This is the entire fleet today. Blaming the operator for not configuring
    // something would send them to the wrong screen.
    expect(getLocationHint({ locationSubnet: "192.168.1.0/24" })).toMatch(/too old/i);
    expect(getLocationHint({})).toMatch(/too old/i);
  });

  it("says nothing once the device actually reported a position", () => {
    expect(getLocationHint({ locationStatus: "ok", locationCity: "Guadalajara" })).toBe("");
  });

  it("says nothing when a site or city already answers the question", () => {
    expect(
      getLocationHint({ locationStatus: "ok", locationSite: "Oficina CDMX", locationSubnet: "192.168.1.0/24" })
    ).toBe("");
  });

  it("survives a null profile", () => {
    expect(() => getLocationHint(null)).not.toThrow();
  });
});
