// src/components/AssetsDashboard/hostHelpers.js
//
// Pure helpers + lookup sets for the Assets dashboard, extracted from the
// god-component. URL-filter parsing, semver-ish version bucketing, host-row
// normalization (folding snake_case ⇄ camelCase backend variants), the hosts
// query builder, device lifecycle/decommission status logic, and the small
// detail formatters. No React — storageHealthColor returns a theme color, so
// the only import is the brand palette.

import { BRAND, ROLE } from "../../theme/brand";

export const ALLOWED_PLATFORMS = new Set(["windows", "macos", "linux", "ios", "android"]);
export const ALLOWED_VERSION_BUCKETS = new Set([
  "current",
  "one_behind",
  "older",
  "unknown"
]);

export function readUrlFilters() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const platform = (params.get("platform") || "").toLowerCase();
  const versionBucket = (params.get("versionBucket") || "").toLowerCase();
  // Phase 4: optional `groupId` deep-link from the Asset Groups tab —
  // operator can click "View devices" on a group and land on the
  // Dashboard pre-scoped to that group's membership. We coerce to a
  // positive integer string; anything else falls back to "".
  const rawGroupId = String(params.get("groupId") || "").trim();
  const groupIdValid = /^[0-9]+$/.test(rawGroupId) && Number(rawGroupId) > 0;
  return {
    platform: ALLOWED_PLATFORMS.has(platform) ? platform : "",
    versionBucket: ALLOWED_VERSION_BUCKETS.has(versionBucket)
      ? versionBucket
      : "",
    groupId: groupIdValid ? rawGroupId : "",
  };
}

// Semver-ish comparison returning a classic -1 / 0 / +1 trichotomy.
// Non-numeric segments become 0 — matches the tolerance of the
// classifyAgentVersions helper used by the Overview donut.
export function compareVersions(a, b) {
  const parse = (v) =>
    String(v || "").split(".").map((x) => Number(x) || 0);
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai !== bi) return ai > bi ? 1 : -1;
  }
  return 0;
}

// Mirror of FleetComposition/classifyAgentVersions bucketing. Kept
// local here because AssetsDashboard is in a different component
// subtree and pulling a shared util out for 15 lines wasn't worth
// adding a new shared module.
export function bucketOfVersion(version, canonicalLatest) {
  if (!version || !canonicalLatest) return "unknown";
  const cmp = compareVersions(version, canonicalLatest);
  if (cmp >= 0) return "current";
  const v = String(version).split(".").map((x) => Number(x) || 0);
  const l = String(canonicalLatest).split(".").map((x) => Number(x) || 0);
  if (v[0] === l[0] && v[1] === l[1] && Math.abs((l[2] || 0) - (v[2] || 0)) <= 2) {
    return "one_behind";
  }
  return "older";
}

export function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Human labels for the mobile MDM/MAM operating mode reported in amp.managed.
export function formatOperatingMode(value) {
  const v = String(value || "").trim();
  if (!v) return "—";
  const map = {
    mdmMam: "MDM + MAM (fully managed)",
    mdmOnly: "MDM only (device managed)",
    mamOnly: "MAM only (app managed)",
    unmanaged: "Unmanaged",
    standalone: "Standalone",
  };
  return map[v] || v;
}

// Storage-health chip color for the mobile managed panel.
export function storageHealthColor(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "ok" || v === "healthy") return ROLE.positive;
  if (v === "low" || v === "warning") return "#B07818";
  if (v === "critical" || v === "full") return ROLE.critical;
  return BRAND.gray;
}

export function getOsVersionDisplayTitle(row) {
  return (
    row?.display_title ||
    row?.commercial_name ||
    row?.os_label ||
    "Unknown OS"
  );
}

export function getOsVersionDisplaySubtitle(row) {
  return (
    row?.display_subtitle ||
    row?.technical_version ||
    row?.os_version ||
    ""
  );
}

export function formatDetailValue(value, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

export function formatDetailDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h24",
  });
}

export function formatDetailPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${parsed.toFixed(1)}%`;
}

export function coalesceValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return value;
  }
  return undefined;
}

export const HOST_SORT_FIELDS = new Set([
  "hostname",
  "agentId",
  "osPlatform",
  "osVersion",
  "manufacturer",
  "model",
  "lastLogonUser",
  "localIp",
  "agentVersion",
  "collectedAtUtc",
]);

export function normalizeHostRow(row = {}) {
  const agentId = coalesceValue(row.agentId, row.agent_id, row.deviceId, row.device_id);
  const hostname = coalesceValue(row.hostname, row.host, row.deviceName, row.device_name);
  const osPlatform = coalesceValue(row.osPlatform, row.os_platform, row.platform);
  const osVersion = coalesceValue(row.osVersion, row.os_version, row.version);
  const lastLogonUser = coalesceValue(row.lastLogonUser, row.last_logon_user);
  const localIp = coalesceValue(row.localIp, row.local_ip);
  const agentVersion = coalesceValue(row.agentVersion, row.agent_version);
  const collectedAtUtc = coalesceValue(row.collectedAtUtc, row.collected_at_utc);

  return {
    ...row,
    agentId,
    agent_id: agentId,
    hostname,
    osPlatform,
    os_platform: osPlatform,
    osVersion,
    os_version: osVersion,
    lastLogonUser,
    last_logon_user: lastLogonUser,
    localIp,
    local_ip: localIp,
    agentVersion,
    agent_version: agentVersion,
    collectedAtUtc,
    collected_at_utc: collectedAtUtc,
    manufacturer: coalesceValue(row.manufacturer),
    model: coalesceValue(row.model),
  };
}

export function buildHostsQuery({ page, pageSize, search, sortBy, sortDir }) {
  const params = new URLSearchParams();
  params.set("page", String(page + 1));
  params.set("pageSize", String(pageSize));

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch.length >= 3) {
    params.set("search", normalizedSearch);
  }

  params.set("sortBy", HOST_SORT_FIELDS.has(sortBy) ? sortBy : "hostname");
  params.set("sortDir", sortDir === "desc" ? "desc" : "asc");

  return params.toString();
}


export function getHostDeviceId(row) {
  const safeRow = row || {};
  return coalesceValue(
    safeRow.agentId,
    safeRow.agent_id,
    safeRow.deviceId,
    safeRow.device_id
  );
}

export function getHostDisplayName(row) {
  const safeRow = row || {};
  return coalesceValue(
    safeRow.hostname,
    safeRow.host,
    safeRow.deviceName,
    safeRow.device_name,
    getHostDeviceId(safeRow)
  );
}

export function normalizeDeviceLifecycleStatus(row) {
  const safeRow = row || {};
  return String(
    safeRow.lifecycleStatus ||
      safeRow.deviceStatus ||
      safeRow.status ||
      safeRow.decommissionStatus ||
      safeRow.decommission_status ||
      ""
  )
    .trim()
    .toUpperCase();
}

export function isDeviceTerminalOrPendingDeletion(row) {
  const status = normalizeDeviceLifecycleStatus(row);
  return [
    "DELETION_PENDING",
    "DECOMMISSION_PENDING",
    "DECOMMISSIONING",
    "DECOMMISSIONED",
    "PURGE_PENDING",
    "PURGED",
  ].includes(status);
}

export function isDecommissionJobTerminal(status) {
  return ["COMPLETED", "DECOMMISSIONED", "FAILED", "PARTIALLY_FAILED", "CANCELLED"].includes(
    String(status || "").toUpperCase()
  );
}

export function getDecommissionErrorMessage(error) {
  const code = String(error?.body?.error || error?.body?.code || "").toUpperCase();

  const knownMessages = {
    FORBIDDEN: "You do not have permission to decommission this device.",
    DEVICE_NOT_FOUND: "Device was not found.",
    DEVICE_ALREADY_DECOMMISSIONED: "This device is already decommissioned.",
    DEVICE_DECOMMISSION_IN_PROGRESS: "Device decommission is already in progress.",
    INVALID_CONFIRMATION: "Confirmation does not match the device hostname or ID.",
  };

  return (
    knownMessages[code] ||
    error?.body?.message ||
    error?.message ||
    "Unable to start device decommission."
  );
}


export function normalizeHostDetailPayload(payload, fallbackHost = {}) {
  const source = payload?.agent || payload?.host || payload?.item || payload || {};
  return {
    agentId: coalesceValue(
      source.agentId,
      source.agent_id,
      source.deviceId,
      source.device_id,
      fallbackHost.agent_id,
      fallbackHost.agentId
    ),
    hostname: coalesceValue(
      source.hostname,
      source.host,
      source.deviceName,
      source.device_name,
      fallbackHost.hostname
    ),
    platform: coalesceValue(source.platform, source.os_platform, fallbackHost.os_platform),
    os: coalesceValue(source.distro, source.os, source.os_version, fallbackHost.os_version),
    agentVersion: coalesceValue(source.agentVersion, source.agent_version, fallbackHost.agent_version),
    lastLogonUser: coalesceValue(source.lastLogonUser, source.last_logon_user, fallbackHost.last_logon_user),
    localIp: coalesceValue(source.localIp, source.local_ip, fallbackHost.local_ip),
    lastSeenAt: coalesceValue(source.lastSeenAt, source.last_seen_at, source.lastHeartbeat, source.last_heartbeat),
    // Mobile (MDM/MAM) managed-state — present only for ios/android devices,
    // surfaced from agent.agent_payload by the detail endpoint.
    isMobile: coalesceValue(source.mobile, fallbackHost.mobile) === "true" || source.mobile === true,
    operatingMode: coalesceValue(source.operatingMode, source.operating_mode),
    storageHealth: coalesceValue(source.storageHealth, source.storage_health),
    // Device location (AMP Phase 1). Desktop fixes are site-level: the backend
    // derives them from the device's local subnet, so `locationSite` is only
    // populated once a CIDR→site mapping exists and the subnet is the fallback
    // label until then. `locationHistory` is the bounded ring buffer (max 10
    // distinct positions, newest first) — always an array.
    locationKey: coalesceValue(source.locationKey, source.location_key),
    locationSource: coalesceValue(source.locationSource, source.location_source),
    locationSite: coalesceValue(source.locationSite, source.location_site),
    locationSubnet: coalesceValue(source.locationSubnet, source.location_subnet),
    locationCity: coalesceValue(source.locationCity, source.location_city),
    locationMapLat: source.locationMapLat ?? source.location_map_lat ?? null,
    locationMapLon: source.locationMapLon ?? source.location_map_lon ?? null,
    locationMapSource: coalesceValue(source.locationMapSource, source.location_map_source),
    locationStatus: coalesceValue(source.locationStatus, source.location_status),
    locationRegion: coalesceValue(source.locationRegion, source.location_region),
    locationCountry: coalesceValue(source.locationCountry, source.location_country),
    locationLastSeenAt: coalesceValue(
      source.locationLastSeenAt,
      source.location_last_seen_at
    ),
    // Coordinates arrive only for `gps` fixes (mobile, Phase 2). Desktop rows
    // are always null here — we never infer coordinates for them.
    locationLat: source.locationLat ?? source.location_lat ?? null,
    locationLon: source.locationLon ?? source.location_lon ?? null,
    locationAccuracyM: source.locationAccuracyM ?? source.location_accuracy_m ?? null,
    locationHistory: Array.isArray(source.locationHistory)
      ? source.locationHistory
      : [],
    raw: source,
  };
}

export function normalizeHardwareDetailPayload(payload, agentId) {
  const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
  const exact = items.find((item) => String(item?.agentId || item?.agent_id || "") === String(agentId));
  return exact || items[0] || null;
}

/**
 * Human label for a device location fix.
 *
 * Falls back down the chain the backend can populate: a mapped site name is
 * best, then the city, then the raw subnet. Returns EMPTY-style "—" when the
 * device has no fix yet — a device that never reported a routable local IP is
 * a legitimate state, not an error.
 */
export function formatLocationLabel(profile) {
  const site = profile?.locationSite;
  if (site) return String(site);

  // The city an operator DECLARED for this range, via the site mapping. Safe to
  // show as the device's location precisely because a human wrote it down.
  const city = profile?.locationCity;
  if (city) return String(city);

  // The IP-derived city (locationIpCity) is deliberately NOT shown here.
  //
  // It answers "where does this device's traffic leave the internet", which on
  // Starlink, satellite or VPN egress is a different city — often a different
  // country — from where the machine physically is. Measured against known
  // hosts: a house in Avandaro reported Chicago (Starlink's CHCOILX1 gateway),
  // and a device reported Montreal. Those are not dataset errors; the IP really
  // does belong to that PoP, so no amount of dataset freshness fixes it.
  //
  // The labels are still collected and still returned by the API — only their
  // promotion to "this is the device's location" is withdrawn, because a wrong
  // city that looks authoritative is worse than no city at all.

  const subnet = profile?.locationSubnet;
  if (subnet) return String(subnet);

  return "—";
}

/**
 * Format a GPS fix for display, or "" when there is none.
 *
 * Shown verbatim rather than reverse-geocoded: Phase 2 exists for device
 * recovery, and an operator chasing a stolen phone needs coordinates they can
 * paste into a map, not a neighbourhood name.
 */
/**
 * Coordinate or null — never a silent zero.
 *
 * `Number(null)` is 0 and passes Number.isFinite, so coercing straight from the
 * payload turns "this device has no GPS fix" into a position off the coast of
 * Africa. Every desktop row carries null here (Phase 1 derives location from
 * the subnet and stores no coordinates), so that mistake is the common case,
 * not the edge case.
 *
 * Zero itself is NOT rejected: lat 0 with a real lon is a point on the equator,
 * and the backend already refuses the (0,0) pair at ingest.
 */
function toCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCoordinates(profile) {
  const lat = toCoordinate(profile?.locationLat);
  const lon = toCoordinate(profile?.locationLon);
  if (lat === null || lon === null) return "";

  const accuracy = toCoordinate(profile?.locationAccuracyM);
  const suffix = accuracy !== null && accuracy > 0 ? ` ±${Math.round(accuracy)} m` : "";
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}${suffix}`;
}

/**
 * The pin to plot for this device, or null when there is nothing to plot.
 *
 * Two very different things can supply it, so the source travels with the
 * coordinates: a `gps` pin is where the device actually reported itself, a
 * `site` pin is only the nominal location of the network it sits on. The map
 * renders them differently — claiming a laptop is exactly at the office pin
 * would be the same category of lie the IP city was.
 */
export function getMapPin(profile) {
  const lat = Number(profile?.locationMapLat);
  const lon = Number(profile?.locationMapLon);
  if (profile?.locationMapLat === null || profile?.locationMapLat === undefined) return null;
  if (profile?.locationMapLon === null || profile?.locationMapLon === undefined) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const source = profile?.locationMapSource === "gps" ? "gps" : "site";
  return {
    lat,
    lon,
    source,
    accuracyM: source === "gps" ? Number(profile?.locationAccuracyM) || null : null,
    label: formatLocationLabel(profile),
  };
}

/**
 * Why the Location field is showing a bare network range.
 *
 * A CIDR is not an answer to "where is this machine" — it is what is left when
 * both real sources are empty. Returning the reason (rather than leaving the
 * operator to infer it from a string of digits) is what turns a dead end into
 * something actionable.
 *
 * Returns "" whenever the label is already meaningful, so the caller can render
 * it unconditionally.
 */
/**
 * What the agent said about its own positioning, in plain language.
 *
 * Mirrors GeoStatus in the agent (plugins/amp/providers/geo.ts). Unknown values
 * are passed through rather than swallowed: the agent ships independently and
 * will report reasons this build has never heard of, and "the agent said
 * something we do not recognise" is still more useful than silence.
 */
const LOCATION_STATUS_TEXT = {
  ok: "",
  disabled: "Location tracking is off for this tenant. Enable it in Policies → Features.",
  unsupported: "This platform has no system location service, so the device cannot report a position.",
  denied: "The endpoint refused: location services are off, or the user declined the prompt.",
  consent_required:
    "Waiting for the person using this Mac to allow location in the prompt. If no prompt appeared, grant it in System Settings › Privacy & Security › Location Services.",
  unavailable: "Location is enabled and granted, but the device has not produced a fix yet — usually indoors or just woken up.",
  no_user_session:
    "Nobody is signed in on this Mac, so nothing can read its position. Not a fault — it resolves when someone logs in.",
  agent_not_publishing:
    "Someone is signed in but the Tracenium menubar app is not reporting. Check that it is running on the endpoint.",
};

export function getLocationHint(profile) {
  const status = profile?.locationStatus;

  // A reason the agent actually gave beats anything we can infer from here.
  if (status && status !== "ok") {
    return LOCATION_STATUS_TEXT[status] ?? `Agent reported location status "${status}".`;
  }

  // No reason reported at all — the agent predates the feature. Say that
  // rather than implying the operator forgot to configure something.
  if (!status && !profile?.locationSite && !profile?.locationCity) {
    return profile?.locationSubnet
      ? "Network range only — this agent is too old to report a position. Upgrade it, or map the range to a site."
      : "This agent is too old to report a position.";
  }

  if (profile?.locationSite || profile?.locationCity) return "";
  if (profile?.locationSubnet) {
    return "Network range only — map it to a site to show a city here.";
  }
  return "";
}
