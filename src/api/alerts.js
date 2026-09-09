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

/**
 * Avisa de que el cursor de alertas se movió.
 *
 * El badge del Topbar vive en otro componente y se entera por un sondeo de
 * 60 s. Sin esto, pulsar "Mark all seen" no cambiaba nada en pantalla durante
 * hasta un minuto — que es exactamente como se ve un botón que no funciona.
 * Mismo patrón que `AUTH_REQUIRED_EVENT`: un CustomEvent en `window`, sin
 * meter estado global por medio.
 */
export const ALERTS_SEEN_EVENT = "tracenium:alerts-seen";

// Moves tenant's last_seen_at to NOW → zeroes the badge.
export async function markAllAlertsSeen() {
  const res = await httpPostJson(`${BASE}/mark-all-seen`, {});
  try {
    window.dispatchEvent(new CustomEvent(ALERTS_SEEN_EVENT));
  } catch { /* sin window (tests, SSR): el sondeo lo recoge igual */ }
  return res;
}
