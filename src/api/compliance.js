// src/api/compliance.js
//
// Typed-ish client for the /security/compliance/* endpoints. Each
// function returns the raw `{ ok, ... }` envelope the backend sends
// so callers can check `res.ok` before touching `res.items` etc.
// The SCP page unwraps uniformly via a shared helper.

import { httpGetJson, httpPostJson, httpPutJson } from "./http";

const BASE = "/api/v1/security/compliance";

// Same API origin the rest of http.js resolves fetches against
// (`${API_BASE}${url}`). Export builders return a raw string used as an
// anchor `href`, so they MUST bake in this absolute base — otherwise the
// browser resolves the path against the SPA origin (which has no /api
// proxy) and downloads index.html instead of the report.
const API_BASE = import.meta.env.VITE_API_BASE;

function buildQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      q.append(k, String(v));
    }
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

// Tenant-wide KPI: scores, status breakdown, open finding counts.
export async function getComplianceSummary() {
  return httpGetJson(`${BASE}/summary`);
}

// Catalog (Control DB, read-only browse).
export async function getComplianceCatalog(params = {}) {
  return httpGetJson(`${BASE}/catalog${buildQuery(params)}`);
}

// Published framework versions (CIS Win11, CIS macOS, NIST 800-53, NIST CSF).
export async function getFrameworks() {
  return httpGetJson(`${BASE}/frameworks`);
}

// Per-framework tenant aggregate (one row per framework; counts + avg score).
export async function getFrameworkSummary() {
  return httpGetJson(`${BASE}/framework-summary`);
}

// Device posture list — optionally filter/project by framework.
export async function getDevicePosture(params = {}) {
  return httpGetJson(`${BASE}/devices${buildQuery(params)}`);
}

// One device's full drilldown (findings + catalog description inline).
export async function getDeviceDetail(agentId) {
  return httpGetJson(`${BASE}/devices/${encodeURIComponent(agentId)}`);
}

// One device's score trend (daily, capped at 90 days server-side).
export async function getDeviceTimeseries(agentId, windowDays = 30) {
  return httpGetJson(
    `${BASE}/devices/${encodeURIComponent(agentId)}/timeseries${buildQuery({ windowDays })}`
  );
}

// Fleet-wide compliance trend: per day, the fleet's average score plus the
// compliant / non-compliant device counts (latest snapshot per device per day).
export async function getFleetComplianceTimeseries(windowDays = 30) {
  return httpGetJson(`${BASE}/fleet-timeseries${buildQuery({ windowDays })}`);
}

// Per-framework compliance trend: { frameworks: [...], buckets: [{ bucket,
// scores: { framework: score } }] }. Recorded from 2026-07 forward — older days
// may be sparse.
export async function getFrameworkComplianceTimeseries(windowDays = 30) {
  return httpGetJson(`${BASE}/framework-timeseries${buildQuery({ windowDays })}`);
}

// ── Sprint 3 — finding lifecycle ───────────────────────────────────
//
// Each helper returns the raw `{ok, ...}` envelope or the failure
// envelope (`{ok:false, code, message, allowedTransitions?}`) so the
// caller can branch on `result.ok`. We deliberately do NOT throw on
// non-200 here because:
//   - INVALID_TRANSITION / FINDING_CLOSED are normal user-flow
//     outcomes (operator picked an action that isn't allowed yet);
//     the UI shows a chip / dialog, not an error toast.
//   - FINDING_NOT_FOUND can happen if another tab closed the
//     finding; we want the calling component to refresh state, not
//     surface a generic "request failed".

// POST /findings/:id/acknowledge — mark a finding as "seen".
// Optional `note` is recorded in the audit timeline.
export async function acknowledgeFinding(findingId, { note } = {}) {
  return httpPostJson(
    `${BASE}/findings/${encodeURIComponent(findingId)}/acknowledge`,
    { note: note ?? null }
  );
}

// POST /findings/:id/acknowledge/revoke — un-ack a previously
// acknowledged finding (e.g. operator changed their mind).
export async function revokeFindingAcknowledgement(findingId, { note } = {}) {
  return httpPostJson(
    `${BASE}/findings/${encodeURIComponent(findingId)}/acknowledge/revoke`,
    { note: note ?? null }
  );
}

// PUT /findings/:id/remediation-status
// `status` must be one of: open | in_progress | remediated |
// risk_accepted | wont_fix. Backend enforces the transition matrix
// and returns `allowedTransitions` on rejection so the UI can show
// the right action set.
export async function updateFindingRemediationStatus(
  findingId,
  { status, note } = {}
) {
  return httpPutJson(
    `${BASE}/findings/${encodeURIComponent(findingId)}/remediation-status`,
    { status, note: note ?? null }
  );
}

// GET /findings/:id/history?limit=N — append-only audit timeline.
// Drives the "History" tab in the finding drawer.
export async function getFindingHistory(findingId, { limit = 200 } = {}) {
  return httpGetJson(
    `${BASE}/findings/${encodeURIComponent(findingId)}/history${buildQuery({ limit })}`
  );
}

// GET /time-to-close?windowDays=N — p50/p90 days from open→close,
// bucketed by severity. Feeds the "MTTR by severity" widget.
export async function getTimeToCloseSummary({ windowDays = 90 } = {}) {
  return httpGetJson(`${BASE}/time-to-close${buildQuery({ windowDays })}`);
}

// ── Sprint 4 — diff vs last scan ───────────────────────────────────
// Returns { ok, diff: { currentSnapshotAt, referenceSnapshotAt,
// added[], removed[], severityChanged[], statusChanged[] } }.
// `vs` is optional — omit it to compare against the device's
// previous snapshot. Pass an ISO 8601 timestamp to compare against
// an arbitrary reference point.
export async function getDeviceFindingsDiff(agentId, { vs } = {}) {
  return httpGetJson(
    `${BASE}/devices/${encodeURIComponent(agentId)}/diff${buildQuery({ vs })}`
  );
}

// ── Sprint 4 — CSV export ──────────────────────────────────────────
// NOT a fetch JSON helper — it returns the absolute URL the browser
// can hit directly to trigger a download. The backend streams the
// CSV and sets Content-Disposition; nothing for us to do client-side
// beyond opening a tab or assigning to window.location. We return
// the URL so the calling component can render it as a link / button
// `href` AND keep the OIDC cookie credentials in flight.
//
// Why URL-not-fetch: a 50 MB CSV streamed through fetch() would have
// to be buffered into a Blob and revoked — fine but pointless when
// the browser's native download path already handles streaming
// efficiently and shows a progress indicator in the chrome.
export function buildFindingsCsvUrl({
  framework,
  includeClosed = false,
  maxRows
} = {}) {
  const qs = buildQuery({ framework, includeClosed, maxRows });
  return `${API_BASE}${BASE}/export/findings.csv${qs}`;
}

// Sprint 6 — PDF export URL. Same browser-native download pattern
// as CSV — backend streams pdfkit output with Content-Disposition.
export function buildFindingsPdfUrl({
  framework,
  includeClosed = false,
  maxDevices
} = {}) {
  const qs = buildQuery({ framework, includeClosed, maxDevices });
  return `${API_BASE}${BASE}/export/findings.pdf${qs}`;
}

// ── Sprint 7 — device fleet ranking ────────────────────────────────
// Returns { ok, ranking: { score, rank, scoredCount, unscoredCount,
// topPercentile } } so the drawer header can render
// "Score 72 · #12 of 45 (top 27%)".
export async function getDeviceFleetRanking(agentId) {
  return httpGetJson(
    `/api/v1/security/compliance/devices/${encodeURIComponent(agentId)}/ranking`
  );
}

// ── Sprint 5 — tenant compliance settings CRUD ────────────────────
// GET returns { ok, settings: { effective, overrides, systemDefaults,
// updatedAt } }; PUT accepts a partial patch and returns the post-
// update view. Null clears an override; undefined leaves a field
// untouched.
export async function getComplianceSettings() {
  return httpGetJson(`${BASE}/settings`);
}

export async function updateComplianceSettings(patch) {
  return httpPutJson(`${BASE}/settings`, patch);
}

// ── Sprint 5 — bulk finding lifecycle op ───────────────────────────
// op: "acknowledge" | "revoke_acknowledgement" | "change_status".
// For change_status, supply { newStatus, findingIds, note? }. Server
// caps the batch at 200 findings; partial failures come back as
// per-item results in `summary.results[]`.
export async function bulkFindingOp({ op, findingIds, newStatus, note } = {}) {
  return httpPostJson(`${BASE}/findings:bulk`, {
    op,
    findingIds,
    newStatus,
    note: note ?? null
  });
}
