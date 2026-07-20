// src/api/patchManagement.js
//
// Typed-ish client for the /patch-management/* endpoints. Same
// envelope convention as compliance.js: callers should check
// `res.ok` before touching the payload.

import { httpGetJson, httpPostJson, httpPatchJson, httpDeleteJson } from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/patch-management";
const API_BASE = import.meta.env.VITE_API_BASE;

export async function getPatchSummary() {
  return httpGetJson(`${BASE}/summary`);
}

export async function getPatchDevices() {
  return httpGetJson(`${BASE}/devices`);
}

export async function getDeviceScanItems(agentId) {
  return httpGetJson(`${BASE}/devices/${encodeURIComponent(agentId)}/items`);
}

// Fleet-wide bulk install. Backend resolves which KB articles to
// install per-device by filtering `patch_management_scan_items` by
// the requested severity, then dispatches a `patch_install` job per
// device with that device's specific KB list. Pass `dryRun: true` to
// get the plan back without dispatching — the page's confirm dialog
// uses this to show the operator exactly what will fan out.
//
// payload shape:
//   {
//     severity: ["critical", "important"],   // required, non-empty
//     platform: "windows" | "macos" | null,  // optional restrict
//     mode: "install" | "download",          // default "install"
//     dryRun: boolean                        // default false
//   }
export async function bulkInstall(payload) {
  return httpPostJson(`${BASE}/bulk-install`, payload);
}

// Force a fresh scan on every PMP-reporting device.
export async function bulkScan() {
  return httpPostJson(`${BASE}/bulk-scan`, {});
}

// ── PMv2 — non-patch security remediation ─────────────────────────
//
// Layered on top of the existing PMP plugin. The agent dispatches by
// `checkId` to a hardcoded whitelist of remediation handlers (TLS,
// SMB, firewall, etc.); this client just speaks the REST shape.


// Aggregated findings for the new tabs (TLS / SMB / Shares / Other).
// Filters supported: category, checkIdContains, severity, limit.
// Returns `{ ok, items: FindingAggregateRow[], totals: {...} }` —
// totals power the per-tab sub-KPI strip.
export async function getFindings(params = {}) {
  return httpGetJson(`${BASE}/findings${buildQuery(params)}`);
}

// Per-finding drilldown: which devices currently fail this checkId.
// Used by the drawer's "Step 1 - target" preview before apply.
export async function getDevicesAffectedByCheck(checkId) {
  return httpGetJson(
    `${BASE}/findings/${encodeURIComponent(checkId)}/devices`
  );
}

// Create a remediation campaign and fan out one job per device.
// payload: { checkId, mode: "apply" | "dry_run",
//            assetGroupId? | deviceIds? }
export async function remediate(payload) {
  return httpPostJson(`${BASE}/remediate`, payload);
}

export async function listRemediations(params = {}) {
  return httpGetJson(`${BASE}/remediations${buildQuery(params)}`);
}

export async function getRemediation(id) {
  return httpGetJson(`${BASE}/remediations/${encodeURIComponent(id)}`);
}

export async function getRemediationResults(id) {
  return httpGetJson(
    `${BASE}/remediations/${encodeURIComponent(id)}/results`
  );
}

export async function cancelRemediation(id) {
  return httpPostJson(
    `${BASE}/remediations/${encodeURIComponent(id)}/cancel`,
    {}
  );
}

// ── Third-party patching (catalog + outdated-software detection) ──

// Fleet rollup: per catalog entry, how many devices run an outdated version.
export async function getThirdPartyFleetFindings() {
  return httpGetJson(`${BASE}/third-party/findings`);
}

// Outdated third-party apps on a single device.
export async function getThirdPartyDeviceFindings(agentId) {
  return httpGetJson(`${BASE}/third-party/findings/devices/${encodeURIComponent(agentId)}`);
}

// One-click remediation: deploy the entry's linked SDP package to the outdated
// devices. 202 with a deployment when dispatched; 200 when nothing was outdated.
export async function remediateThirdParty(catalogId) {
  return httpPostJson(`${BASE}/third-party/remediate`, { catalogId });
}

// The tenant's third-party software catalog (latest version + remediation link).
export async function listThirdPartyCatalog(params = {}) {
  return httpGetJson(`${BASE}/third-party/catalog${buildQuery(params)}`);
}

export async function createThirdPartyCatalog(payload) {
  return httpPostJson(`${BASE}/third-party/catalog`, payload);
}

export async function updateThirdPartyCatalog(id, payload) {
  return httpPatchJson(`${BASE}/third-party/catalog/${encodeURIComponent(id)}`, payload);
}

export async function deleteThirdPartyCatalog(id) {
  return httpDeleteJson(`${BASE}/third-party/catalog/${encodeURIComponent(id)}`);
}

// ── CVE mapping (vulnerable installed software) ──────────────────

// Fleet exposure: severity totals + per-CVE rollup (how many devices run a
// vulnerable version). Computed on read from the catalog + live inventory.
export async function getVulnerabilityExposure() {
  return httpGetJson(`${BASE}/vulnerabilities/exposure`);
}

// Vulnerable installed software on a single device (drill-in).
export async function getDeviceVulnerabilities(agentId) {
  return httpGetJson(`${BASE}/vulnerabilities/exposure/devices/${encodeURIComponent(agentId)}`);
}

// Absolute URL for the auditor-ready exposure PDF. NOT a fetch helper — the
// browser hits it directly so Content-Disposition drives the download and the
// OIDC cookie stays in flight (same pattern as the compliance export).
export function buildCveExposureReportPdfUrl() {
  return `${API_BASE}${BASE}/vulnerabilities/exposure/report.pdf`;
}

// One-click remediation: deploy the CVE entry's linked SDP package to the
// vulnerable devices. 202 with a deployment when dispatched; 200 when nothing
// was vulnerable.
export async function remediateCveVulnerability(catalogId) {
  return httpPostJson(`${BASE}/vulnerabilities/remediate`, { catalogId });
}

// The tenant's CVE catalog (product + affected version range + CVSS).
export async function listCveCatalog(params = {}) {
  return httpGetJson(`${BASE}/vulnerabilities/catalog${buildQuery(params)}`);
}

export async function createCveCatalog(payload) {
  return httpPostJson(`${BASE}/vulnerabilities/catalog`, payload);
}

export async function updateCveCatalog(id, payload) {
  return httpPatchJson(`${BASE}/vulnerabilities/catalog/${encodeURIComponent(id)}`, payload);
}

export async function deleteCveCatalog(id) {
  return httpDeleteJson(`${BASE}/vulnerabilities/catalog/${encodeURIComponent(id)}`);
}

// NVD sync — ingest CVEs for the fleet's software into the catalog. Trigger is
// admin-only + fire-and-forget (202); status is a plain read.
export async function triggerNvdSync(payload = {}) {
  return httpPostJson(`${BASE}/vulnerabilities/sync`, payload);
}

export async function getNvdSyncStatus() {
  return httpGetJson(`${BASE}/vulnerabilities/sync/status`);
}

// CISA KEV (Known Exploited Vulnerabilities) — the GLOBAL actively-exploited
// catalog (one CISA feed shared by all tenants). Trigger is admin-only +
// fire-and-forget (202); status is a plain read.
export async function triggerKevSync() {
  return httpPostJson(`${BASE}/vulnerabilities/kev/sync`, {});
}

export async function getKevSyncStatus() {
  return httpGetJson(`${BASE}/vulnerabilities/kev/sync/status`);
}

// ── Maintenance windows (when deployments are allowed to dispatch) ─

export async function listMaintenanceWindows() {
  return httpGetJson(`${BASE}/maintenance-windows`);
}

export async function createMaintenanceWindow(payload) {
  return httpPostJson(`${BASE}/maintenance-windows`, payload);
}

export async function updateMaintenanceWindow(id, payload) {
  return httpPatchJson(`${BASE}/maintenance-windows/${encodeURIComponent(id)}`, payload);
}

export async function deleteMaintenanceWindow(id) {
  return httpDeleteJson(`${BASE}/maintenance-windows/${encodeURIComponent(id)}`);
}
