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

// Devices (enrolled + active) with `rcpEnabled` flag. Drives the
// "Start a session" table.
export async function getConnectableDevices() {
  return httpGetJson(`${BASE}/devices`);
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
