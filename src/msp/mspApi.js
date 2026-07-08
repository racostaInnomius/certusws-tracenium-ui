// src/msp/mspApi.js
//
// Thin wrappers over the MSP portfolio endpoints (F1). The backend keys
// the response off the caller's identity:
//   * vendor (admin_master) → { level: "vendor", items: [MSP cards] }
//   * MSP operator          → { level: "msp",    items: [client cards] }
//   * single-tenant user    → { level: "none",   items: [] }

import { httpGetJson } from "../api/http";

/**
 * The logged-in user's portfolio. `cache: "no-store"` on the first load
 * so a just-changed hierarchy (client added, etc.) shows immediately;
 * callers that want caching can pass their own options.
 */
export async function fetchPortfolio(options = {}) {
  return httpGetJson("/api/v1/msp/portfolio", { cache: "no-store", ...options });
}

/**
 * Clients of a specific MSP — the vendor drill-down (vendor → MSP →
 * client). 403 if the caller is neither the vendor nor a member of the MSP.
 */
export async function fetchMspClients(mspId, options = {}) {
  return httpGetJson(
    `/api/v1/msp/portfolio/${encodeURIComponent(mspId)}/clients`,
    { cache: "no-store", ...options }
  );
}

/**
 * Consolidated aggregate across the caller's portfolio (F2): totals +
 * the "needs attention" exception list. Reads the materialized roll-up.
 */
export async function fetchConsolidated(options = {}) {
  return httpGetJson("/api/v1/msp/consolidated", { staleMs: 60_000, ...options });
}
