// src/components/RemoteControl/rcpMethods.js
//
// Remote Control's vocabulary and predicates, in a module with no React.
//
// This used to live scattered: the three icons and their tooltips inside
// ConnectablesTable, the raw `type` inside the page, and the relationship
// between "screen" and "rcp.screen" implicit in three separate places. A
// fourth caller (the wizard) would have made four copies, so it moves here.
//
// ⚠️ Everything in this file is pure on purpose: it's what can be tested
// without mounting a component, and it's where the logic that actually
// decides whether a device shows up in a list lives.

/**
 * The three things you can do against a device.
 *
 * `label` is written from the operator's side — what they want to achieve —
 * not the system's. "Run commands" is an intent; "rcp.shell" is an
 * implementation. The wizard shows the former, and `capability` is the only
 * thing ever compared against what the agent advertises.
 *
 * `policyName` is the agent-policy switch that turns the capability on. It
 * appears in the message explaining why a device can't do something: without
 * it, "the agent doesn't advertise rcp.screen" tells the operator what is
 * missing but not where to fix it.
 */
export const RCP_METHODS = [
  {
    type: "shell",
    capability: "rcp.shell",
    label: "Run commands",
    action: "Console",
    description: "A console on the device, as if you were sitting in front of it.",
    policyName: "remoteShell"
  },
  {
    type: "file",
    capability: "rcp.file",
    label: "Browse and move files",
    action: "Files",
    description: "Explore folders, upload and download files.",
    policyName: "remoteFile"
  },
  {
    type: "screen",
    capability: "rcp.screen",
    label: "See the screen",
    action: "Screen",
    description: "Watch what the user sees and, if needed, take control.",
    policyName: "remoteScreen"
  }
];

const BY_TYPE = new Map(RCP_METHODS.map((m) => [m.type, m]));

export function methodFor(type) {
  return BY_TYPE.get(String(type || "")) || null;
}

/**
 * Platform as its vendor writes it.
 *
 * The table used to run CSS `text-transform: capitalize` over the raw value,
 * which renders "macos" as "Macos" — a spelling Apple has never used. A map
 * costs three lines and the wizard needs the same labels anyway.
 */
const PLATFORM_LABEL = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux"
};

export function platformLabel(platform) {
  const key = String(platform || "").toLowerCase();
  return PLATFORM_LABEL[key] || (platform ? String(platform) : "—");
}

function capsOf(device) {
  return Array.isArray(device?.capabilities) ? device.capabilities : [];
}

/** Does the agent advertise this method's capability? */
export function deviceSupports(device, type) {
  const method = methodFor(type);
  if (!method) return false;
  return capsOf(device).includes(method.capability);
}

/**
 * Does the device advertise ANY remote control capability?
 *
 * This looks at the prefix rather than the `rcpEnabled` flag because they
 * are different things: `rcpEnabled` is the bare "rcp" capability (the
 * plugin loaded), while the three gates travel as `rcp.shell` / `rcp.file` /
 * `rcp.screen` and are switched on independently by policy. A device with
 * the plugin loaded and all three gates closed is useless here, and
 * `rcpEnabled` would let it into the list.
 */
export function hasAnyRcp(device) {
  return capsOf(device).some((c) => String(c).startsWith("rcp."));
}

/**
 * Why this method CANNOT be opened against this device, in one sentence
 * aimed at whoever reads it. `null` means it can.
 *
 * The order is deliberate: first what the operator can resolve by waiting
 * (offline), then what requires touching the policy.
 */
export function blockedReason(device, type) {
  const method = methodFor(type);
  if (!method) return "Unknown session type.";
  if (!deviceSupports(device, type)) {
    return `This agent doesn't offer it. Turn on ${method.policyName} in the device's policy.`;
  }
  if (!device?.online) return "The device is offline.";
  return null;
}

export function canStart(device, type) {
  return blockedReason(device, type) === null;
}

/** The methods this device can serve right now. */
export function availableMethods(device) {
  return RCP_METHODS.filter((m) => canStart(device, m.type));
}

/**
 * The three numbers in the KPI strip.
 *
 * ⚠️ This is computed in the browser because `/devices` currently returns
 * the whole fleet unpaginated. That's acceptable at today's scale and it's
 * what lets phase 1 ship without touching the backend, but it is this
 * screen's known ceiling: phase 3 moves to server-side `page`/`pageSize`/
 * `search`, and then these numbers must come from `/devices/facets`.
 * Counting over a page would be counting 25 devices and calling it the
 * fleet — exactly the bug this function exists to fix in the old card.
 */
export function summarizeFleet(devices) {
  const list = Array.isArray(devices) ? devices : [];
  let readyNow = 0;
  let rcpCapable = 0;
  for (const d of list) {
    if (!hasAnyRcp(d)) continue;
    rcpCapable += 1;
    if (d?.online) readyNow += 1;
  }
  return { readyNow, rcpCapable, fleetTotal: list.length };
}

/** How many devices can serve each method right now. */
export function countsByMethod(devices) {
  const list = Array.isArray(devices) ? devices : [];
  const counts = {};
  for (const m of RCP_METHODS) {
    counts[m.type] = list.filter((d) => canStart(d, m.type)).length;
  }
  return counts;
}

/**
 * The text a device is searched by.
 *
 * `groupNames` and `siteName` don't come back from `/devices` yet — they
 * arrive in phase 3 — but they're already part of the haystack: when the
 * backend sends them, searching by group works without touching this
 * function or its tests. Including an absent field costs nothing;
 * forgetting it costs a second pass over all three callers.
 */
function haystack(device) {
  const groups = Array.isArray(device?.groupNames) ? device.groupNames.join(" ") : "";
  return [
    device?.hostname || "",
    device?.deviceId || "",
    device?.platform || "",
    device?.siteName || "",
    groups
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesSearch(device, search) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return true;
  return haystack(device).includes(q);
}

/**
 * The list that gets rendered, after every filter.
 *
 * `keepIds` is the deliberate exception: a device reached through a deep
 * link (Asset Management's `?highlightAgentId=`) has to show up even when
 * the filters exclude it. Without this, following the link for an offline
 * device lands on a table that doesn't contain it and the flash highlights
 * a row that isn't there.
 */
export function filterDevices(devices, opts = {}) {
  const {
    search = "",
    onlineOnly = false,
    includeWithoutRcp = false,
    method = null,
    keepIds = []
  } = opts;

  const kept = new Set((keepIds || []).map(String).filter(Boolean));
  const list = Array.isArray(devices) ? devices : [];

  return list.filter((d) => {
    if (kept.has(String(d?.deviceId))) return true;
    if (!includeWithoutRcp && !hasAnyRcp(d)) return false;
    if (method && !deviceSupports(d, method)) return false;
    if (onlineOnly && !d?.online) return false;
    return matchesSearch(d, search);
  });
}

/**
 * How many devices the "without remote control" filter hides.
 *
 * This feeds a counter that is ALWAYS visible next to the toggle. A filter
 * that is on by default and doesn't say how much it hides produces the worst
 * possible question — "where is my device?" — and that question ends up as a
 * support ticket.
 */
export function countWithoutRcp(devices) {
  const list = Array.isArray(devices) ? devices : [];
  return list.filter((d) => !hasAnyRcp(d)).length;
}
