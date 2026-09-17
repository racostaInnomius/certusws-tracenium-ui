// src/components/patch-management/restartRequest.js
//
// Restart a device on demand from the Patch Management drawer. PURE — no React.
//
// Decision (17-sep): by default the restart waits for the tenant's maintenance
// window, like a patch install; «Restart now» is the explicit exception and must
// be confirmed by typing the device's name. The backend enforces the window
// (job `device_reboot`, `when` required) — this module only decides what the
// dialog lets through and what to tell the operator afterwards.

import { formatOpensAt } from "./patchGateOutcome";

export const RESTART_WHEN = Object.freeze({
  WINDOW: "maintenance_window",
  NOW: "now",
});

/** `{ when, reason? }` — `when` is always written, never left to a default. */
export function buildRestartPayload({ when, reason } = {}) {
  const w = when === RESTART_WHEN.NOW ? RESTART_WHEN.NOW : RESTART_WHEN.WINDOW;
  const r = typeof reason === "string" ? reason.trim().slice(0, 200) : "";
  return r ? { when: w, reason: r } : { when: w };
}

/**
 * Can the dialog submit? The window option always can. «Now» needs the device
 * name typed back — case-insensitive, surrounding spaces ignored — so a restart
 * outside the window is never one misclick away.
 */
export function canConfirmRestart({ when, typedName, deviceName }) {
  if (when !== RESTART_WHEN.NOW) return true;
  const expected = String(deviceName ?? "").trim().toLowerCase();
  return expected.length > 0 && String(typedName ?? "").trim().toLowerCase() === expected;
}

/** What to say after the backend answered `{ status, gate: { status, opensAt } }`. */
export function describeRestartOutcome(res) {
  const status = res?.gate?.status || res?.status;
  if (status === "awaiting_window") {
    const when = formatOpensAt(res?.gate?.opensAt);
    return {
      severity: "info",
      held: true,
      message: when
        ? `Restart held until the maintenance window opens (${when})`
        : "Restart held until the next maintenance window opens",
    };
  }
  return { severity: "success", held: false, message: "Restart requested — the device restarts about a minute after it receives it" };
}
