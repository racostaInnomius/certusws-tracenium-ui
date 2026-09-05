// src/api/remoteControl.js
//
// Client for the /api/v1/remote-control/* endpoints. The backend
// today returns stubs (zeros + empty lists) because the `rcp` plugin
// isn't shipped on the agent side yet. The wire contract is stable;
// when the plugin lands the UI picks up real data without code
// changes here.

import { httpGetJson, httpPostJson, httpPutJson } from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/remote-control";


// Tenant-wide KPIs for the Hero strip. Shape:
//   { ok, summary: { connectableDevices, activeSessions,
//                    sessionsLast7d, avgDurationSec } }
export async function getRemoteControlSummary() {
  return httpGetJson(`${BASE}/summary`);
}

// One PAGE of connectable devices, filtered server-side.
//
// This used to take no arguments and return the whole fleet, which the
// browser then filtered in JavaScript. Every filter here is applied in SQL
// now, across both databases — see modules/remote-control/device-list.ts.
//
// Params: page, pageSize (capped at 100), search, capability, rcpOnly,
// onlineOnly, groupId, platform.
// Returns { ok, count, items, total, page, pageSize }.
//
// `search` covers hostname, platform, identifier AND group name — the last
// one resolved on the control database and merged in, so "I remember the
// group, not the host" works from the same box.
export async function getConnectableDevices(params = {}) {
  return httpGetJson(`${BASE}/devices${buildQuery(params)}`);
}

// The options the filter dropdowns offer: the tenant's asset groups and the
// platforms actually present. Separate from /devices because a dropdown's
// contents don't change as you page through a list.
export async function getDeviceFacets() {
  return httpGetJson(`${BASE}/devices/facets`);
}

// Session history. Empty until the plugin ships.
export async function getRemoteSessions(params = {}) {
  return httpGetJson(`${BASE}/sessions${buildQuery(params)}`);
}

// Start a session.
//
// M2.S1 — returns 200 + { ok, sessionId, signalingUrl, turnConfig }
// for type "shell" (M1.S1+) or "file" (M2.S1) when the device
// advertises the matching rcp capability AND the caller is
// admin_master. "screen" still returns 501 until M3.
//
// Error envelopes (HTTP 4xx) carry { error, message }. The UI maps
// them to friendly toasts in pages/RemoteControl.jsx:handleConnect.
// ADR-0009 fase 1 — `reason` y `ticketRef` son obligatorios. El backend
// responde 400 REASON_REQUIRED / TICKET_REF_REQUIRED si faltan, y NO
// llega a abrir la sesión.
export async function startRemoteSession({ deviceId, type, reason, ticketRef }) {
  return httpPostJson(`${BASE}/sessions`, { deviceId, type, reason, ticketRef });
}

// El expediente: quién ha entrado, a qué y por qué. Cubre todas las
// capacidades, no solo las de RCP.
export async function listAccessRequests(params = {}) {
  return httpGetJson(`${BASE}/access-requests${buildQuery(params)}`);
}

// One session with its access record: who connected, to what, why, under
// which ticket, and how it ended. 404 both for a session that doesn't exist
// and for one belonging to another tenant.
export async function getSessionDetail(sessionId) {
  return httpGetJson(`${BASE}/sessions/${encodeURIComponent(sessionId)}`);
}

// M2.S1 — list file transfer audit records for a session.
// Returns { ok, total, items: FileTransferRecord[] }.
export async function getSessionFileTransfers(sessionId, params = {}) {
  return httpGetJson(
    `${BASE}/sessions/${encodeURIComponent(sessionId)}/transfers${buildQuery(params)}`
  );
}

// M2.S2 — tenant-wide file transfer audit view.
// Filters: direction, status, deviceId, filename, limit.
// Returns { ok, total, items: FileTransferRecord[] }.
export async function getAllFileTransfers(params = {}) {
  return httpGetJson(`${BASE}/file-transfers${buildQuery(params)}`);
}

/**
 * Corrige a mano la clase de un equipo.
 *
 * ⚠️ Es un cambio de PRIVILEGIO, no una etiqueta. La clase decide si hace
 * falta vistobueno para entrar (`access_policy`) y si se le pregunta al
 * usuario del equipo antes de mirarle la pantalla. Marcar un servidor como
 * `endpoint` le quita lo primero y le pone lo segundo — por eso el backend
 * lo deja en `security_events` con el valor anterior y el nuevo.
 */
export async function setDeviceClass(deviceId, deviceClass) {
  return httpPutJson(`${BASE}/devices/${encodeURIComponent(deviceId)}/class`, {
    deviceClass
  });
}

// ── ADR-0009 fase 2 — política de acceso y cola de aprobación ────────

/** La matriz (clase de equipo × capacidad) → requiere visto bueno. */
export async function getAccessPolicy() {
  return httpGetJson(`${BASE}/access-policy`);
}

/**
 * Enciende o apaga UNA celda.
 *
 * Una por petición y no la matriz entera: un guardado masivo desde una
 * pantalla con datos viejos apagaría en silencio lo que otro
 * administrador acabara de encender.
 */
export async function setAccessPolicyCell({ capability, deviceClass, requiresApproval, jitMinutes }) {
  return httpPutJson(`${BASE}/access-policy`, {
    capability,
    deviceClass,
    requiresApproval,
    jitMinutes
  });
}

/** Solicitudes esperando decisión. */
export async function listPendingApprovals() {
  return httpGetJson(`${BASE}/approvals`);
}

/** Aprobar o denegar. El aprobador lo pone el backend desde la sesión. */
export async function decideApproval(requestId, approve) {
  return httpPostJson(`${BASE}/approvals/${encodeURIComponent(requestId)}`, { approve });
}
