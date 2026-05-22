// src/api/remoteControl.js
//
// Client for the /api/v1/remote-control/* endpoints. The backend
// today returns stubs (zeros + empty lists) because the `rcp` plugin
// isn't shipped on the agent side yet. The wire contract is stable;
// when the plugin lands the UI picks up real data without code
// changes here.

import { httpGetJson, httpPostJson } from "./http";

const BASE = "/api/v1/remote-control";

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
export async function startRemoteSession({ deviceId, type }) {
  return httpPostJson(`${BASE}/sessions`, { deviceId, type });
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
