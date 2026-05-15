// src/api/retention.js
//
// Thin wrappers around /api/v1/retention/*. The retention surface is
// admin-only — the role gate is applied at the UI layer (we only
// render the card / page for OWNER+ADMIN) but the backend also
// enforces tenant context via oidcMiddleware + tenantMiddleware.

import { httpGetJson, httpPutJson, httpPostJson } from "./http";

/**
 * GET /api/v1/retention/stats
 *
 * Returns:
 *   {
 *     ok: true,
 *     policy: {
 *       tenantId, enabled,
 *       factsEventsDays, hardwareInventoryDays, softwareInventoryDays,
 *       securityComplianceSnapshotDays, patchManagementSnapshotDays,
 *       inventoryChangeEventsDays, softwareCurrentAppOfflineDays,
 *       preserveBaseline, preserveLatest, batchSize,
 *       lastRunAtUtc, lastRunDeletedTotal, lastRunSummary
 *     },
 *     sizes: {
 *       tenantId, tenantDb,
 *       perTable: [{ table, rows, sizeBytes }, ...]
 *     }
 *   }
 */
export async function getRetentionStats() {
  return httpGetJson("/api/v1/retention/stats");
}

export async function getRetentionPolicy() {
  return httpGetJson("/api/v1/retention/policy");
}

/**
 * PUT /api/v1/retention/policy — partial update; omitted fields are
 * left untouched on the server. Sending only `{ enabled: false }`
 * disables retention without losing the existing per-table day counts.
 */
export async function updateRetentionPolicy(patch) {
  return httpPutJson("/api/v1/retention/policy", patch);
}

/**
 * POST /api/v1/retention/run?dry=true|false
 *
 * Synchronously runs the cleanup loop for this tenant. With dry=true
 * the server counts candidates without deleting anything — that's the
 * preview the UI offers before the first real run after a policy edit.
 */
export async function runRetention({ dryRun = true } = {}) {
  return httpPostJson(
    `/api/v1/retention/run?dry=${dryRun ? "true" : "false"}`,
    {}
  );
}
