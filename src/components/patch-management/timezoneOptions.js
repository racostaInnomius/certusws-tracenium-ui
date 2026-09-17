// src/components/patch-management/timezoneOptions.js
//
// The timezone list for maintenance windows. PURE — no React.
//
// ⚠️ WHY (T111, 17-sep): the picker offered eleven hard-coded zones. The
// operator for a site in McAllen, TX picked America/Chicago «because the right
// one wasn't there» — it WAS the right one (McAllen is on US Central time), but
// nothing on screen said so. A window evaluated in the wrong zone opens at the
// wrong hour: patches and reboots in office hours.
//
// Now: every IANA zone the browser knows (the backend accepts exactly those),
// each labelled with its current UTC offset, and searchable by the cities an
// operator would actually type — which IANA names don't contain («McAllen»,
// «Monterrey», «Houston»…).

/**
 * Cities / regions per zone, for search and for the label. Not exhaustive:
 * the places this product's tenants are in, plus the big ones around them.
 * A city missing here is still reachable by its IANA name.
 */
export const TIMEZONE_ALIASES = Object.freeze({
  "America/Chicago": ["US Central", "Houston", "Dallas", "San Antonio", "Austin", "McAllen", "Brownsville", "Laredo", "Corpus Christi", "Oklahoma City", "Kansas City", "Minneapolis", "New Orleans", "Memphis", "Nashville", "Milwaukee"],
  "America/New_York": ["US Eastern", "Miami", "Atlanta", "Boston", "Washington DC", "Philadelphia", "Detroit", "Charlotte"],
  "America/Denver": ["US Mountain", "Denver", "Salt Lake City", "El Paso", "Albuquerque", "Boise"],
  "America/Phoenix": ["Arizona", "Phoenix", "Tucson"],
  "America/Los_Angeles": ["US Pacific", "Los Angeles", "San Francisco", "San Diego", "Seattle", "Portland", "Las Vegas"],
  "America/Anchorage": ["Alaska"],
  "Pacific/Honolulu": ["Hawaii"],
  "America/Mexico_City": ["Ciudad de México", "CDMX", "Guadalajara", "Puebla", "Querétaro", "León"],
  "America/Monterrey": ["Monterrey", "Saltillo", "San Pedro Garza García"],
  "America/Matamoros": ["Matamoros", "Reynosa", "Nuevo Laredo"],
  "America/Chihuahua": ["Chihuahua"],
  "America/Ciudad_Juarez": ["Ciudad Juárez"],
  "America/Hermosillo": ["Sonora", "Hermosillo"],
  "America/Mazatlan": ["Mazatlán", "Culiacán", "La Paz"],
  "America/Tijuana": ["Tijuana", "Mexicali", "Ensenada"],
  "America/Cancun": ["Cancún", "Quintana Roo", "Playa del Carmen"],
  "America/Merida": ["Mérida"],
  "America/Bogota": ["Bogotá", "Medellín", "Colombia"],
  "America/Lima": ["Lima", "Perú"],
  "America/Santiago": ["Santiago de Chile"],
  "America/Argentina/Buenos_Aires": ["Buenos Aires", "Argentina"],
  "America/Sao_Paulo": ["São Paulo", "Rio de Janeiro", "Brasil"],
  "America/Guatemala": ["Guatemala"],
  "America/Costa_Rica": ["San José", "Costa Rica"],
  "America/Panama": ["Panamá"],
  "America/Puerto_Rico": ["Puerto Rico", "San Juan"],
  "America/Toronto": ["Toronto", "Ottawa", "Montréal"],
  "America/Vancouver": ["Vancouver"],
  "Europe/Madrid": ["Madrid", "Barcelona", "España"],
  "Europe/London": ["London", "UK"],
  "Europe/Berlin": ["Berlin", "Frankfurt"],
  "Europe/Paris": ["Paris"],
  "Asia/Tokyo": ["Tokyo"],
  UTC: ["Coordinated Universal Time", "GMT"],
});

/** «UTC−05:00» for a zone at `now`. Unicode minus, like the OS pickers. */
export function utcOffsetLabel(timeZone, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(now);
    const raw = parts.find((p) => p.type === "timeZoneName")?.value || "GMT";
    // "GMT-05:00" / "GMT+05:30" / "GMT" (for UTC itself)
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(raw);
    if (!m || (m[2] === "00" && m[3] === "00")) return "UTC±00:00";
    return `UTC${m[1] === "-" ? "−" : "+"}${m[2]}:${m[3]}`;
  } catch {
    return "";
  }
}

function offsetMinutes(label) {
  const m = /UTC([+−±])(\d{2}):(\d{2})/.exec(label);
  if (!m) return 0;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "−" ? -v : v;
}

/** Every zone the runtime knows, plus `UTC` (which `supportedValuesOf` omits). */
export function allTimezones() {
  let zones = [];
  try {
    zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  } catch {
    zones = [];
  }
  const set = new Set(zones.length ? zones : Object.keys(TIMEZONE_ALIASES));
  set.add("UTC");
  return Array.from(set);
}

/**
 * `[{ value, offset, cities, label, search }]`, sorted by offset then name.
 * `extra` — a zone already saved on a window — is always included, even if this
 * browser does not list it, so editing never silently changes it.
 */
export function buildTimezoneOptions({ extra, now = new Date(), zones = allTimezones() } = {}) {
  const set = new Set(zones);
  if (extra) set.add(extra);
  return Array.from(set)
    .map((value) => {
      const offset = utcOffsetLabel(value, now);
      const cities = TIMEZONE_ALIASES[value] || [];
      const label = `(${offset}) ${value.replace(/_/g, " ")}${cities.length ? ` — ${cities.slice(0, 4).join(", ")}` : ""}`;
      const search = [value, value.replace(/_/g, " "), ...cities].join(" ").toLowerCase();
      return { value, offset, cities, label, search };
    })
    .sort((a, b) => offsetMinutes(a.offset) - offsetMinutes(b.offset) || a.value.localeCompare(b.value));
}

/** Accent- and case-insensitive match on IANA name OR any alias city. */
export function matchTimezone(option, query) {
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const q = norm(query).trim();
  if (!q) return true;
  return norm(option.search).includes(q);
}
