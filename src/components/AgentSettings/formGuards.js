// src/components/AgentSettings/formGuards.js
//
// What must be true of the form before Save is allowed. Pure, so the page
// and the tests agree on it. Interval cards already paint their own error
// text; this is the list that turns the Save button off — the agent
// silently reverts an out-of-range value to its default, so letting one
// through would save a number nobody runs.

import {
  CDP_INTERVAL_MAX,
  CDP_INTERVAL_MIN,
  COMPLIANCE_INTERVAL_MAX,
  COMPLIANCE_INTERVAL_MIN,
  INVENTORY_INTERVAL_MAX,
  INVENTORY_INTERVAL_MIN,
  PATCH_INTERVAL_MAX,
  PATCH_INTERVAL_MIN,
  UPDATE_INTERVAL_MAX,
  UPDATE_INTERVAL_MIN,
} from "../Policies/policyTransforms";

const INTERVALS = [
  { key: "inventory", label: "Inventory interval", min: INVENTORY_INTERVAL_MIN, max: INVENTORY_INTERVAL_MAX, section: "amp" },
  { key: "compliance", label: "Compliance interval", min: COMPLIANCE_INTERVAL_MIN, max: COMPLIANCE_INTERVAL_MAX, section: "scp" },
  { key: "patch", label: "Patch scan interval", min: PATCH_INTERVAL_MIN, max: PATCH_INTERVAL_MAX, section: "pmp" },
  { key: "update", label: "Update probe interval", min: UPDATE_INTERVAL_MIN, max: UPDATE_INTERVAL_MAX, section: "agent" },
  { key: "cdp", label: "Crypto scan interval", min: CDP_INTERVAL_MIN, max: CDP_INTERVAL_MAX, section: "cdp" },
];

function isBlank(v) {
  return v === null || v === undefined || v === "";
}

/** [{ section, message }] — empty when the form can be saved. */
export function formProblems(form) {
  const out = [];
  for (const spec of INTERVALS) {
    const raw = form?.[spec.key]?.intervalSeconds;
    if (isBlank(raw)) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < spec.min || n > spec.max) {
      out.push({ section: spec.section, message: `${spec.label} must be between ${spec.min} and ${spec.max} seconds.` });
    }
  }
  return out;
}

/**
 * The agent-config slice this page owns, as the server will store it.
 * `formToPolicy` rebuilds the whole document (security / MAM included,
 * read-only at load), so the foreign domains are stripped — the same
 * strip the save path does, so "what the diff shows" and "what is sent"
 * are the same object.
 */
export function agentConfigSlice(form, catalog, formToPolicy) {
  const slice = formToPolicy(form, catalog);
  delete slice.security;
  delete slice.mam;
  delete slice.managedApp;
  return slice;
}

// Mirror of POLICY_DOMAINS["agent-config"] in the backend
// (modules/policies/policies.service.ts). The server enforces it on PATCH;
// the UI needs it for the one write that is not a PATCH — see below.
export const AGENT_CONFIG_KEYS = [
  "plugins",
  "modules",
  "inventory",
  "compliance",
  "patch",
  "update",
  "agent",
  "features",
  "rcp",
  "cdp",
  "ai",
  "sdp",
];

/**
 * The document a FIRST device override is created with.
 *
 * An override is a whole document (`device ?? tenant`): a device with one
 * stops reading the tenant policy entirely. So the first write must carry
 * everything the device runs today — security baselines, MAM, the gateway
 * block, MDM platforms — verbatim, and replace only the agent-config keys
 * with what the form says. Same replace-slice semantics as the server's
 * domain merge, applied client-side because there is no row to merge into.
 *
 * Not `formToPolicy(form)`: the form round-trip only knows the keys it
 * edits, and drops or reshapes the rest.
 */
export function composeFirstOverride(effectiveJson, slice) {
  const base = effectiveJson && typeof effectiveJson === "object" && !Array.isArray(effectiveJson) ? effectiveJson : {};
  const out = { ...base };
  for (const key of AGENT_CONFIG_KEYS) delete out[key];
  for (const [key, value] of Object.entries(slice || {})) out[key] = value;
  return out;
}
