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
/**
 * `isAutoAvailable(cap)` decide si una capability puede remediar en `auto`.
 * Por defecto lee el flag estático `enforcer`; el llamador que tenga la matriz
 * del backend (usePluginCatalog().capabilityAuto) la pasa y el flag pasa a ser
 * solo la red de seguridad. Sin este parámetro el puente seguiría diciendo lo
 * que la UI cree, no lo que el agente sabe hacer.
 */
export function baselineModeForCategory(
  securityForm,
  category,
  isAutoAvailable = (cap) => Boolean(cap?.enforcer)
) {
  return modeForCapabilities(securityForm, capabilitiesForCategory(category), isAutoAvailable);
}

function modeForCapabilities(securityForm, caps, isAutoAvailable) {
  if (!caps.length) return null;

  const entries = caps.map((cap) => ({
    cap,
    mode: resolveMode(securityForm?.capabilities?.[cap.key], securityForm?.defaultMode),
  }));
  const enforceable = entries.filter((e) => isAutoAvailable(e.cap));

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

/** "Windows" / "macOS" / "windows" / "macos" → "windows" / "macos". */
function normPlatform(p) {
  return String(p || "").trim().toLowerCase();
}

/**
 * Las capabilities que gobiernan UN hallazgo de UN equipo.
 *
 * ⚠️ Por categoría a secas no sirve: la categoría mezcla plataformas y checks
 * que ninguna capability toca. En prod, el Secure Boot de un Windows
 * (categoría `integrity`) decía «Gatekeeper can remediate this automatically»
 * — Gatekeeper es de macOS y no arregla Secure Boot (recorrido del 25-sep).
 *
 *   · `catalogChecksFor(capKey)` — la lista de checks que la matriz del
 *     backend dice que gobierna esa capability (usePluginCatalog). Cuando
 *     llega, manda: la capability es del hallazgo si su check está en ella.
 *   · Si la matriz no llegó (backend anterior), cae a categoría + plataforma
 *     del equipo: menos fino, pero nunca una capability de otro sistema.
 */
export function capabilitiesForFinding(finding, { platform = null, catalogChecksFor = null } = {}) {
  const checkId = String(finding?.checkId || "");
  const exact = catalogChecksFor
    ? SECURITY_CAPABILITIES.map((cap) => ({ cap, checks: catalogChecksFor(cap.key) }))
    : [];
  if (exact.length && exact.every((e) => Array.isArray(e.checks))) {
    return exact.filter((e) => checkId && e.checks.includes(checkId)).map((e) => e.cap);
  }
  const plat = normPlatform(platform);
  return capabilitiesForCategory(finding?.category).filter(
    (cap) => !plat || (cap.osTags ?? []).some((t) => normPlatform(t) === plat)
  );
}

/** baselineModeForCategory, pero para un hallazgo concreto de un equipo. */
export function baselineModeForFinding(
  securityForm,
  finding,
  ctx = {},
  isAutoAvailable = (cap) => Boolean(cap?.enforcer)
) {
  return modeForCapabilities(securityForm, capabilitiesForFinding(finding, ctx), isAutoAvailable);
}
