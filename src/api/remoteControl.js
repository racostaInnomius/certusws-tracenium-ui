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

// Start a session. Returns HTTP 501 + { error: "RCP_PLUGIN_NOT_AVAILABLE" }
// today — the page surfaces a targeted "Coming soon" toast off that
// specific error code.
export async function startRemoteSession({ deviceId, type }) {
  return httpPostJson(`${BASE}/sessions`, { deviceId, type });
}
