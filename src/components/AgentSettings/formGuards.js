// src/components/AgentSettings/formGuards.js
//
// What must be true of the form before Save is allowed, and how a save is
// cut into per-domain slices. Pure, so the page and the tests agree.
//
// Phase B: each section saves ONLY its policy domain (backend
// POLICY_DOMAINS, mirrored in DOMAIN_PATHS below). A device override is a
// PATCH on the tenant policy: the device slice carries only the paths that
// differ from the tenant, so an override says exactly what it changes.

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
import { sectionForPath } from "./sections";

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

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
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
 * The agent-config part of a form, as the server would store it.
 * `formToPolicy` rebuilds the whole document (security / MAM included,
 * read-only at load), so the foreign domains are stripped, and so are
 * `plugins`/`modules`: activation follows the plan and no editor sends it.
 */
export function agentConfigSlice(form, catalog, formToPolicy) {
  const slice = formToPolicy(form, catalog);
  delete slice.security;
  delete slice.mam;
  delete slice.managedApp;
  delete slice.plugins;
  delete slice.modules;
  return slice;
}

// Mirror of POLICY_DOMAINS in the backend (modules/policies/policies.service.ts)
// for the domains this page saves. A path is a top-level key, or one level
// deeper for the `features` block that agent and rcp share. If this drifts
// from the backend, saves come back as 400 DOMAIN_KEY_VIOLATION naming the
// path — loud, not silent.
export const DOMAIN_PATHS = {
  agent: ["update", "agent", "features.selfUpdate", "features.deviceInfoWidget", "features.locationTracking"],
  amp: ["inventory"],
  scp: ["compliance"],
  pmp: ["patch"],
  sdp: ["sdp"],
  cdp: ["cdp"],
  rcp: [
    "rcp",
    "remoteControl",
    "features.remoteShell",
    "features.remoteFile",
    "features.remoteScreen",
    "features.remoteRequireConsent",
    "features.remoteRecordScreen",
  ],
  ai: ["ai"],
};

export const AGENT_DOMAINS = Object.keys(DOMAIN_PATHS);

function getPath(doc, path) {
  const [key, sub] = path.split(".");
  const v = doc?.[key];
  if (sub === undefined) return v;
  return isPlainObject(v) ? v[sub] : undefined;
}

function setPath(out, path, value) {
  const [key, sub] = path.split(".");
  if (sub === undefined) {
    out[key] = value;
    return;
  }
  out[key] = { ...(isPlainObject(out[key]) ? out[key] : {}), [sub]: value };
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The complete replace-slice of one domain, cut from the agent-config
 * slice of a form. A path absent from the document is absent from the
 * slice (omit-empty: the server removes it).
 */
export function domainSlice(domain, fullSlice) {
  const out = {};
  for (const path of DOMAIN_PATHS[domain] || []) {
    const v = getPath(fullSlice, path);
    if (v !== undefined) setPath(out, path, v);
  }
  return out;
}

/**
 * The device's slice for one domain: ONLY the paths whose value differs
 * from the tenant's. Everything else is inherited, so the override stored
 * for the device says exactly what it changes — and a value edited back to
 * the tenant's drops out of the override instead of pinning it.
 */
export function deviceDomainSlice(domain, deviceSlice, tenantSlice) {
  const out = {};
  for (const path of DOMAIN_PATHS[domain] || []) {
    const v = getPath(deviceSlice, path);
    if (v === undefined) continue;
    if (sameValue(v, getPath(tenantSlice, path))) continue;
    setPath(out, path, v);
  }
  return out;
}

/** Domains a diff (see policyDiff.js) touches, in DOMAIN_PATHS order. */
export function domainsTouched(diffEntries) {
  const hit = new Set();
  for (const e of Array.isArray(diffEntries) ? diffEntries : []) {
    const id = sectionForPath(e.path);
    if (DOMAIN_PATHS[id]) hit.add(id);
  }
  return AGENT_DOMAINS.filter((d) => hit.has(d));
}

/** Sections (= domains) an override's paths belong to. */
export function overriddenDomains(paths) {
  const out = new Set();
  for (const p of Array.isArray(paths) ? paths : []) {
    const id = sectionForPath(p);
    if (DOMAIN_PATHS[id]) out.add(id);
  }
  return out;
}
