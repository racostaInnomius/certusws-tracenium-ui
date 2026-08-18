// src/api/licensing.js — ADR-0005 D5/D6.

import { httpGetJson, httpPostJson } from "./http";

/**
 * Current license standing: fleet vs cap, the open adjustment if any, and
 * whether the console is blocked.
 *
 * Readable by any tenant member on purpose — the blocked screen is shown
 * to everyone, and a non-admin who could not read this would face a
 * locked UI with no explanation of why.
 */
export function getLicenseState() {
  return httpGetJson("/api/v1/licensing/state");
}

/** Accept the proposed device count. ADMIN/OWNER only, server-enforced. */
export function acceptLicenseAdjustment(adjustmentId) {
  return httpPostJson(`/api/v1/licensing/adjustments/${adjustmentId}/accept`, {});
}
