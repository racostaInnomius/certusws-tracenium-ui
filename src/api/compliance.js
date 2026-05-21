// src/api/compliance.js
//
// Typed-ish client for the /security/compliance/* endpoints. Each
// function returns the raw `{ ok, ... }` envelope the backend sends
// so callers can check `res.ok` before touching `res.items` etc.
// The SCP page unwraps uniformly via a shared helper.

import { httpGetJson, httpPostJson, httpPutJson } from "./http";

const BASE = "/api/v1/security/compliance";

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
