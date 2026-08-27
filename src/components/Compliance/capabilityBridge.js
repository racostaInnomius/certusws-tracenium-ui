// src/components/Compliance/capabilityBridge.js
//
// Fase C — the vocabulary bridge between the module's two halves:
//   Baselines speak CAPABILITIES (policyTransforms SECURITY_CAPABILITIES
//   keys — what we require), Posture speaks CATEGORIES (the catalog's
//   `category` column — how the evidence is grouped). Until this file
//   existed the two surfaces shared zero vocabulary, so an operator
//   could stare at 12 firewall failures with no path to the switch that
//   fixes them.
//
// The map is GROUNDED IN THE CATALOG SEEDS, not in intuition — each
// entry lists the `category` values of the actual checks the capability
// governs (verified against modules/db/migrations/*compliance_catalog*
// on 2026-08-13, re-verified 2026-08-27).
//
// Ya no hay dos cubos de cripto: la migración 20260827 fusionó 'crypto'
// en 'cryptography' porque el desglose por categoría los pintaba uno al
// lado del otro y nadie sabía cuál era cuál — no había criterio que los
// separase, sólo el orden en que se sembraron.
//
// Un reparto que SÍ se conserva porque significa algo: los checks de ssh
// caen en 'identity_policy' (comportamiento de autenticación) y en
// 'cryptography' (fuerza de los algoritmos). Son dos preguntas distintas
// sobre el mismo servicio.
//
// This is a UI-side crosswalk of CATEGORIES. The finer-grained
// checkId-level detection↔remediation crosswalk (namespaces still
// diverge, e.g. windows.crypto.* vs windows.cryptography.*) is backend
// work — see SCP-IMPROVEMENT-PLAN.md Fase C+.

import { SECURITY_CAPABILITIES } from "../Policies/policyTransforms";

export const CAPABILITY_TO_CATEGORIES = {
  firewall: ["firewall"],
  ssh: ["identity_policy", "cryptography"],
  tls: ["cryptography"],
  smb: ["network_sharing"],
  gatekeeper: ["integrity"],
  remoteLogin: ["network_sharing"],
  sip: ["integrity"],
  filevault: ["disk_encryption"],
  passwordPolicy: ["identity_policy", "cryptography"],
  bitlocker: ["disk_encryption"],
  // usb has no catalog checks yet — policy intent is stored but there
  // is no evidence to bridge to.
  usb: [],
  shares: ["network_sharing"],
};

const CAP_BY_KEY = new Map(SECURITY_CAPABILITIES.map((c) => [c.key, c]));

export function categoriesForCapability(capabilityKey) {
  return CAPABILITY_TO_CATEGORIES[capabilityKey] ?? [];
}

/** Capabilities (full SECURITY_CAPABILITIES entries) whose checks land in `category`. */
export function capabilitiesForCategory(category) {
  const key = String(category || "");
  return Object.entries(CAPABILITY_TO_CATEGORIES)
    .filter(([, cats]) => cats.includes(key))
    .map(([capKey]) => CAP_BY_KEY.get(capKey))
    .filter(Boolean);
}

// Mode semantics: a null/absent per-capability mode inherits the
// form's defaultMode (readSecurityFromPolicy defaults THAT to
// "report-only" when the policy says nothing).
export function resolveMode(entry, defaultMode) {
  const mode = entry?.mode ?? defaultMode;
  return mode === "off" || mode === "auto" ? mode : "report-only";
}

/**
 * Posture-side lookup: given the security form (readSecurityFromPolicy
 * shape) and a catalog category, summarize how the mapped capabilities
 * are configured. Returns null when the category maps to nothing —
 * callers render no chip rather than a misleading one.
 *
 * `mode` is the MOST permissive… actually the most *aggressive* mode
 * across the mapped capabilities is not what an operator scanning rows
 * needs — they need "is anything still not auto?" So:
 *   - every enforceable capability in auto  → "auto"
 *   - any enforceable capability off        → "off" wins the label only
 *     if ALL are off; otherwise mixed states render as "report-only"
 *     (the conservative truthful summary: something detects, not all fix).
 */
export function baselineModeForCategory(securityForm, category) {
  const caps = capabilitiesForCategory(category);
  if (!caps.length) return null;

  const entries = caps.map((cap) => ({
    cap,
    mode: resolveMode(securityForm?.capabilities?.[cap.key], securityForm?.defaultMode),
  }));
  const enforceable = entries.filter((e) => e.cap.enforcer);

  let mode;
  if (entries.every((e) => e.mode === "off")) {
    mode = "off";
  } else if (enforceable.length > 0 && enforceable.every((e) => e.mode === "auto")) {
    mode = "auto";
  } else {
    mode = "report-only";
  }

  return {
    mode,
    capabilities: entries.map((e) => e.cap),
    // Enforceable caps not yet in auto — the "Set to auto" action's target.
    autoUpgradable: enforceable.filter((e) => e.mode !== "auto").map((e) => e.cap),
  };
}

/**
 * Baselines-side lookup: aggregate the category-summary rows
 * ({category, passed, failed, highSeverityFails, devicesFailing,
 * devices}) into per-capability evidence. Sums are per mapped category;
 * devicesFailing is summed too (a device failing in two mapped
 * categories counts twice — documented trade-off, the API offers no
 * cross-category distinct count).
 */
export function evidenceForCapability(categorySummaryItems, capabilityKey) {
  const cats = new Set(categoriesForCapability(capabilityKey));
  if (!cats.size) return null;
  const rows = (categorySummaryItems || []).filter((r) => cats.has(String(r?.category)));
  if (!rows.length) return null;

  const sum = (field) => rows.reduce((acc, r) => acc + (Number(r?.[field]) || 0), 0);
  return {
    failed: sum("failed"),
    highSeverityFails: sum("highSeverityFails"),
    devicesFailing: sum("devicesFailing"),
    devices: Math.max(...rows.map((r) => Number(r?.devices) || 0)),
    categories: rows.map((r) => String(r.category)),
  };
}
