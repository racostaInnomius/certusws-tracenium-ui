// src/msp/mspApi.js
//
// Thin wrappers over the MSP portfolio endpoints (F1). The backend keys
// the response off the caller's identity:
//   * vendor (admin_master) → { level: "vendor", items: [MSP cards] }
//   * MSP operator          → { level: "msp",    items: [client cards] }
//   * single-tenant user    → { level: "none",   items: [] }

import {
  httpGetJson,
  httpPostJson,
  httpPatchJson,
  httpDeleteJson,
  httpGetBlob,
} from "../api/http";
import { saveBlob } from "../utils/browserState";

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

/**
 * The caller's own MSP memberships (+ role). Empty for the vendor and
 * plain single-tenant users. The UI offers "Manage team" for any MSP where
 * the caller's role is OWNER (self-service).
 */
export async function fetchMyMemberships(options = {}) {
  return httpGetJson("/api/v1/msp/my-memberships", { cache: "no-store", ...options });
}

// ── F3 vendor admin (hierarchy management) ────────────────────────────
//
// Every one of these is vendor-only (admin_master); the backend returns
// 403 VENDOR_ONLY otherwise. They mutate the tenant tree, so reads use
// no-store to always reflect the just-made change.

/** All MSPs with their client + operator counts. */
export async function fetchAdminMsps(options = {}) {
  return httpGetJson("/api/v1/msp/admin/msps", { cache: "no-store", ...options });
}

/** Create a structural MSP tenant under the vendor root. */
export async function createMsp(name) {
  return httpPostJson("/api/v1/msp/admin/msps", { name });
}

/** Clients not yet sorted under an MSP (no parent or parented to vendor). */
export async function fetchUnassignedClients(options = {}) {
  return httpGetJson("/api/v1/msp/admin/unassigned-clients", { cache: "no-store", ...options });
}

/**
 * Attach a client to an MSP (mspId) or detach it (mspId = null → back to
 * the unassigned pool).
 */
export async function assignClient(clientId, mspId) {
  return httpPatchJson(
    `/api/v1/msp/admin/clients/${encodeURIComponent(clientId)}/assign`,
    { mspId: mspId == null ? null : mspId }
  );
}

/** Operators (TenantMember rows) on a given MSP. */
export async function fetchMspOperators(mspId, options = {}) {
  return httpGetJson(
    `/api/v1/msp/admin/msps/${encodeURIComponent(mspId)}/operators`,
    { cache: "no-store", ...options }
  );
}

/** Add (or reactivate/update) an operator on an MSP. */
export async function addMspOperator(mspId, { subject, email, role }) {
  return httpPostJson(
    `/api/v1/msp/admin/msps/${encodeURIComponent(mspId)}/operators`,
    { subject, email, role }
  );
}

/** Remove an operator from an MSP. */
export async function removeMspOperator(mspId, memberId) {
  return httpDeleteJson(
    `/api/v1/msp/admin/msps/${encodeURIComponent(mspId)}/operators/${encodeURIComponent(memberId)}`
  );
}

// Vendor-only. The backend refuses to cascade: 409 MSP_HAS_CLIENTS /
// MSP_HAS_OPERATORS if the partner isn't empty, so callers should
// surface `err.body.message` rather than a generic failure.
export async function deleteMsp(mspId) {
  return httpDeleteJson(`/api/v1/msp/admin/msps/${encodeURIComponent(mspId)}`);
}

// ── F4 reports ────────────────────────────────────────────────────────

/** Per-client report (identity + current metrics + trend + deltas). */
export async function fetchClientReport(clientId, { from, to } = {}, options = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs}` : "";
  return httpGetJson(`/api/v1/msp/reports/clients/${encodeURIComponent(clientId)}${suffix}`, { cache: "no-store", ...options });
}

/** Download the client report as CSV or PDF (authenticated blob → save). */
export async function downloadClientReport(clientId, fmt, { from, to } = {}) {
  const ext = fmt === "pdf" ? "pdf" : "csv";
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs}` : "";
  const { blob, filename } = await httpGetBlob(
    `/api/v1/msp/reports/clients/${encodeURIComponent(clientId)}/export.${ext}${suffix}`
  );
  saveBlob(blob, filename || `tracenium-client-${clientId}.${ext}`);
}

// ── Claim codes (self-service client-attach) ──────────────────────────

/** Active claim codes for an MSP (vendor or OWNER of it). */
export async function fetchClaimCodes(mspId, options = {}) {
  return httpGetJson(`/api/v1/msp/admin/msps/${encodeURIComponent(mspId)}/claim-codes`, { cache: "no-store", ...options });
}

/** Issue a claim code for an MSP. */
export async function generateClaimCode(mspId, { ttlDays } = {}) {
  return httpPostJson(`/api/v1/msp/admin/msps/${encodeURIComponent(mspId)}/claim-codes`, ttlDays ? { ttlDays } : {});
}

/** Revoke an unused claim code. */
export async function revokeClaimCode(mspId, code) {
  return httpDeleteJson(`/api/v1/msp/admin/msps/${encodeURIComponent(mspId)}/claim-codes/${encodeURIComponent(code)}`);
}

/** The caller tenant's partner status (managed by X / can join). */
export async function fetchMyPartner(options = {}) {
  return httpGetJson("/api/v1/msp/my-partner", { cache: "no-store", ...options });
}

/** Redeem a claim code for the caller's own (unassigned client) tenant. */
export async function redeemClaimCode(code) {
  return httpPostJson("/api/v1/msp/claim-codes/redeem", { code });
}

// ── MSP-provisioned clients (create + assign admin) ───────────────────

/** Pending clients an MSP created that await their admin's first login. */
export async function fetchPendingClients(mspId, options = {}) {
  return httpGetJson(`/api/v1/msp/admin/msps/${encodeURIComponent(mspId)}/clients`, { cache: "no-store", ...options });
}

/** Create a client tenant under an MSP + assign an admin (by IDP user id). */
export async function createManagedClient(mspId, { name, adminSubject, adminEmail } = {}) {
  return httpPostJson(`/api/v1/msp/admin/msps/${encodeURIComponent(mspId)}/clients`, { name, adminSubject, adminEmail });
}
