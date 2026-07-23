import { httpGetJson, httpPostJson } from "./http";

// Operator-side client for the MDM-lite native command queue. The
// device side (drain + ack) speaks mTLS and never touches this file.
const BASE = "/api/v1/mobile-commands";

// App-scoped command surface. Mirrors MOBILE_COMMAND_TYPES on the backend.
// `needsBody` drives the UI: only `alert` prompts for a message.
export const MOBILE_COMMANDS = [
  { type: "lock", label: "Lock app", description: "Lock the managed app; the user must re-authenticate to reopen it.", needsBody: false },
  { type: "selectiveWipe", label: "Selective wipe", description: "Clear app data and the enrolled identity on this device (app-scoped, not a device wipe).", needsBody: false, destructive: true },
  { type: "alert", label: "Send message", description: "Show a message to the device user.", needsBody: true },
  { type: "locate", label: "Locate", description: "Request last-known location (best-effort; the device reports 'unsupported' when location permission is absent).", needsBody: false },
];

/**
 * Issue a command to a device. Returns { ok, command }.
 * @param {string} deviceId
 * @param {{ type: string, params?: object, ttlSeconds?: number }} body
 */
export async function issueMobileCommand(deviceId, body) {
  return httpPostJson(`${BASE}/devices/${encodeURIComponent(deviceId)}`, body);
}

/**
 * Recent command history for a device. Returns { ok, commands }.
 */
export async function listMobileCommands(deviceId, { limit } = {}) {
  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  return httpGetJson(`${BASE}/devices/${encodeURIComponent(deviceId)}${qs}`);
}
