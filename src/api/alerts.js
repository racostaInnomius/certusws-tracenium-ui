// src/api/alerts.js
//
// Typed-ish client for the /api/v1/alerts/* endpoints. Each function
// returns the raw backend envelope so the caller can check `ok` and
// destructure whichever fields it needs. Mirrors the shape of
// src/api/compliance.js.

import { httpGetJson, httpPostJson, httpPatchJson, httpDeleteJson } from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/alerts";


// Rule catalog + tenant rules
export async function getAlertRules() {
  return httpGetJson(`${BASE}/rules`);
}

// Creates a tenant rule (optionally copying from a template).
// Body: { templateId?, name, severity, source, criteria, enabled? }
export async function createAlertRule(body) {
  return httpPostJson(`${BASE}/rules`, body);
}

// Partial update — send only the fields that changed.
// Body: { name?, enabled?, severity?, criteria? }
export async function patchAlertRule(id, body) {
  return httpPatchJson(`${BASE}/rules/${encodeURIComponent(id)}`, body);
}

export async function deleteAlertRule(id) {
  return httpDeleteJson(`${BASE}/rules/${encodeURIComponent(id)}`);
}

// Feed — same query params accepted by the backend.
export async function getAlertEvents(params = {}) {
  return httpGetJson(`${BASE}/events${buildQuery(params)}`);
}

// Bell badge.
export async function getAlertsUnreadCount() {
  return httpGetJson(`${BASE}/unread-count`);
}

// Moves tenant's last_seen_at to NOW → zeroes the badge.
export async function markAllAlertsSeen() {
  return httpPostJson(`${BASE}/mark-all-seen`, {});
}
