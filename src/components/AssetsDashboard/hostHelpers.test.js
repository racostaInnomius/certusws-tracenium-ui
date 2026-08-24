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
  getPositionFreshness,
  formatPositionSource,
  formatFormFactor,
  getOsLifecycle,
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

describe("normalizeHostDetailPayload — el allowlist deja pasar location", () => {
  it("conserva locationFixAt, sin el cual no hay 'última posición conocida'", () => {
    // Regresión: el campo se quedó fuera del literal y la distinción entre
    // posición actual y última conocida murió entre el API y el render, con el
    // backend mandándola correctamente. El objeto es un allowlist, así que un
    // campo no nombrado se pierde sin error.
    const out = normalizeHostDetailPayload({
      agent: { agent_id: "a1", locationFixAt: "2026-08-18T09:11:00.000Z" },
    });
    expect(out.locationFixAt).toBe("2026-08-18T09:11:00.000Z");
  });

  it("deja pasar el pin completo de una posición vieja", () => {
    // El caso de campo entero: una Mac offline cuyo último fix es de ayer
    // tiene que llegar al drawer con coordenadas Y con su fecha.
    const out = normalizeHostDetailPayload({
      agent: {
        agent_id: "a1",
        locationMapLat: 19.364695,
        locationMapLon: -99.183,
        locationMapSource: "gps",
        locationLat: 19.364695,
        locationLon: -99.183,
        locationFixAt: "2026-08-18T09:11:00.000Z",
      },
    });
    const pin = getMapPin(out);
    expect(pin).not.toBeNull();
    expect(pin.source).toBe("gps");
    expect(pin.freshness).toBe("last_known");
  });
});

describe("formatPositionSource", () => {
  it("traduce el vocabulario del agente a algo accionable", () => {
    expect(formatPositionSource({ locationPositionSource: "wifi" })).toBe("Wi-Fi");
    expect(formatPositionSource({ locationPositionSource: "satellite" })).toBe("Satellite");
    expect(formatPositionSource({ locationPositionSource: "unknown" })).toBe("Method not reported");
  });

  it("deja pasar un método que este build no conoce", () => {
    // El agente se despliega por su cuenta y va a reportar métodos nuevos.
    // Esconderlos repetiría el error que este campo existe para terminar.
    expect(formatPositionSource({ locationPositionSource: "lidar" })).toBe("lidar");
  });

  it("no dice nada cuando no hay dato", () => {
    // macOS no expone el método, y los agentes viejos tampoco lo mandan.
    expect(formatPositionSource({ locationPositionSource: null })).toBe("");
    expect(formatPositionSource({})).toBe("");
  });

  it("pone el método JUNTO a la precisión en las coordenadas", () => {
    // ⚠️ Esta pareja es el punto entero: ±35 m por Wi-Fi y ±35 m por satélite
    // se leen igual y no merecen la misma confianza. Un equipo reportó ±35 m
    // estando a 120 km.
    const line = formatCoordinates({
      locationLat: 19.364695,
      locationLon: -99.161331,
      locationAccuracyM: 35,
      locationPositionSource: "wifi",
    });
    expect(line).toBe("19.36470, -99.16133 ±35 m · Wi-Fi");
  });

  it("sin método, la línea de coordenadas queda como antes", () => {
    expect(
      formatCoordinates({ locationLat: 19.364695, locationLon: -99.161331, locationAccuracyM: 35 })
    ).toBe("19.36470, -99.16133 ±35 m");
  });
});

describe("normalizeHostDetailPayload — locationPositionSource sobrevive al allowlist", () => {
  it("conserva el método de posicionamiento", () => {
    // Tercera vez que este literal se come un campo de location. El test va
    // junto al de locationFixAt por la misma razón: el objeto no falla, calla.
    const out = normalizeHostDetailPayload({ agent: { agent_id: "a1", locationPositionSource: "wifi" } });
    expect(out.locationPositionSource).toBe("wifi");
  });

  it("el pin GPS lo lleva consigo; el de sitio no", () => {
    const gps = getMapPin({
      locationMapLat: 19.36,
      locationMapLon: -99.16,
      locationMapSource: "gps",
      locationPositionSource: "satellite",
    });
    expect(gps.positionSource).toBe("Satellite");

    // Un pin de sitio no se posicionó: atribuirle un método sería inventar una
    // medición que nadie tomó.
    const site = getMapPin({
      locationMapLat: 19.43,
      locationMapLon: -99.13,
      locationMapSource: "site",
      locationPositionSource: "satellite",
    });
    expect(site.positionSource).toBe("");
  });
});

describe("getPositionFreshness", () => {
  const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

  it("calls a fresh fix the device's current position", () => {
    const f = getPositionFreshness({ locationFixAt: minutesAgo(12) }, "gps");
    expect(f.kind).toBe("current");
    expect(f.label).toBe("Current position");
  });

  it("calls an old fix the LAST KNOWN position, with its age", () => {
    // This is the whole point of the field: a Mac that got a fix this morning
    // and has been checking in all day without another one is showing a
    // this-morning position. Presenting it as "current" is the lie.
    const f = getPositionFreshness({ locationFixAt: minutesAgo(6 * 60) }, "gps");
    expect(f.kind).toBe("last_known");
    expect(f.label).toMatch(/Last known position/);
    expect(f.label).toMatch(/6h ago/);
  });

  it("uses the agent's own 60-minute window as the boundary", () => {
    // Past its own staleness window the agent stops treating the cached fix as
    // current; claiming otherwise here would contradict the component that
    // took the measurement.
    expect(getPositionFreshness({ locationFixAt: minutesAgo(59) }, "gps").kind).toBe("current");
    expect(getPositionFreshness({ locationFixAt: minutesAgo(61) }, "gps").kind).toBe("last_known");
  });

  it("does NOT date a site pin — nobody measured the device there", () => {
    const f = getPositionFreshness({ locationFixAt: minutesAgo(5) }, "site");
    expect(f.kind).toBe("site");
    expect(f.ageMinutes).toBeNull();
  });

  it("stays quiet when the backend does not send a fix time", () => {
    // An older control plane. Inventing an age would be worse than omitting it.
    const f = getPositionFreshness({}, "gps");
    expect(f.kind).toBe("unknown");
    expect(f.ageMinutes).toBeNull();
    expect(f.label).toBe("Device-reported position");
  });

  it("ignores an unparseable timestamp instead of rendering NaN", () => {
    expect(getPositionFreshness({ locationFixAt: "no soy una fecha" }, "gps").kind).toBe("unknown");
  });
});

describe("getMapPin — freshness travels with the pin", () => {
  it("marks a stale gps pin so the map can draw it differently", () => {
    const pin = getMapPin({
      locationMapLat: 19.3646,
      locationMapLon: -99.183,
      locationMapSource: "gps",
      locationFixAt: new Date(Date.now() - 8 * 3600_000).toISOString(),
    });
    expect(pin.freshness).toBe("last_known");
    expect(pin.freshnessLabel).toMatch(/Last known position/);
  });

  it("marks a fresh one as current", () => {
    const pin = getMapPin({
      locationMapLat: 19.3646,
      locationMapLon: -99.183,
      locationMapSource: "gps",
      locationFixAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    expect(pin.freshness).toBe("current");
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

describe("formatFormFactor", () => {
  it("nombra el tipo de equipo", () => {
    expect(formatFormFactor({ formFactor: "laptop" })).toBe("Laptop");
    expect(formatFormFactor({ formFactor: "server" })).toBe("Server");
    expect(formatFormFactor({ formFactor: "desktop" })).toBe("Desktop");
  });

  it("la virtualización es un eje aparte, no otro valor", () => {
    // Un servidor puede ser virtual. Colapsarlos en un solo valor perdería
    // una de las dos cosas — en la flota hay un Windows Server en Hyper-V.
    expect(formatFormFactor({ formFactor: "server", isVirtual: true })).toBe("Server · virtual");
  });

  it("unknown se muestra como unknown, con lo que dijo la máquina", () => {
    // No se disfraza de escritorio: este dato alimenta ventanas de
    // mantenimiento y políticas.
    expect(formatFormFactor({ formFactor: "unknown", chassisRaw: "Other", isVirtual: true }))
      .toBe('Unknown · virtual · reported "Other"');
  });

  it("no repite el crudo cuando ya se pudo clasificar", () => {
    // "Laptop · reported Notebook" sería ruido.
    expect(formatFormFactor({ formFactor: "laptop", chassisRaw: "Notebook" })).toBe("Laptop");
  });

  it("un perfil sin dato cae a unknown en vez de romperse", () => {
    expect(formatFormFactor({})).toBe("Unknown");
    expect(formatFormFactor(null)).toBe("Unknown");
  });
});

describe("normalizeHostDetailPayload — formFactor sobrevive al allowlist", () => {
  it("conserva la clasificación y sus dos ejes", () => {
    // Cuarta vez que se agrega un campo a este literal. El test va por la misma
    // razón que los de locationFixAt y locationPositionSource: no falla, calla.
    const out = normalizeHostDetailPayload({
      agent: { agent_id: "a1", formFactor: "server", isVirtual: true, chassisRaw: "Desktop" },
    });
    expect(out.formFactor).toBe("server");
    expect(out.isVirtual).toBe(true);
    expect(formatFormFactor(out)).toBe("Server · virtual");
  });

  it("cae al campo type cuando el backend no manda chassisRaw", () => {
    const out = normalizeHostDetailPayload({ agent: { agent_id: "a1", type: "Notebook" } });
    expect(out.chassisRaw).toBe("Notebook");
  });
});

describe("getOsLifecycle", () => {
  it("nombra cada estado con palabras de operador", () => {
    expect(getOsLifecycle({ lifecycle_status: "eol" }).label).toBe("Unsupported");
    expect(getOsLifecycle({ lifecycle_status: "approaching_eol" }).label).toBe("Ends soon");
    expect(getOsLifecycle({ lifecycle_status: "security_only" }).label).toBe("Security fixes only");
    expect(getOsLifecycle({ lifecycle_status: "supported" }).label).toBe("Supported");
  });

  it("⚠️ marca como riesgo sólo lo que pide una decisión", () => {
    // security_only NO es riesgo: el equipo sigue recibiendo parches. Meterlo
    // en el contador inflaría la alarma con equipos que están protegidos.
    expect(getOsLifecycle({ lifecycle_status: "eol" }).isRisk).toBe(true);
    expect(getOsLifecycle({ lifecycle_status: "approaching_eol" }).isRisk).toBe(true);
    expect(getOsLifecycle({ lifecycle_status: "security_only" }).isRisk).toBe(false);
    expect(getOsLifecycle({ lifecycle_status: "supported" }).isRisk).toBe(false);
  });

  it("el detalle dice de qué lado del calendario estamos", () => {
    // Un número suelto no distingue "faltan 50 días" de "hace 50 días".
    expect(getOsLifecycle({ lifecycle_status: "approaching_eol", lifecycle_days_remaining: 50 }).detail)
      .toBe("Ends soon · in 50 days");
    expect(getOsLifecycle({ lifecycle_status: "eol", lifecycle_days_remaining: -707 }).detail)
      .toBe("Unsupported · 2 years ago");
  });

  it("⚠️ unknown se muestra, no se esconde", () => {
    // Es la señal de que ese SO no está catalogado. Esconderlo lo volvería
    // invisible justo cuando hace falta catalogarlo.
    const lc = getOsLifecycle({ lifecycle_status: "unknown" });
    expect(lc.label).toBe("Unknown");
    expect(lc.isRisk).toBe(false);
  });

  it("una fila sin dato cae a unknown en vez de romperse", () => {
    expect(getOsLifecycle({}).status).toBe("unknown");
    expect(getOsLifecycle(null).status).toBe("unknown");
  });
});
