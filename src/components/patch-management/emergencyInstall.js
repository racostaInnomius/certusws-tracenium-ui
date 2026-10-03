// src/components/patch-management/emergencyInstall.js
//
// ADR-0038 D6 — the emergency (outside the window) install, as the request needs it.

export const EMERGENCY_MIN_REASON = 5;

/** `{ emergency: { reason } }` for the request, or nothing. */
export function emergencyField(checked, reason) {
  return checked ? { emergency: { reason: String(reason ?? "").trim() } } : {};
}

export function emergencyReady(checked, reason) {
  return !checked || String(reason ?? "").trim().length >= EMERGENCY_MIN_REASON;
}
