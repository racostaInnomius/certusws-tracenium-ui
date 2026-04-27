// src/api/patchManagement.js
//
// Typed-ish client for the /patch-management/* endpoints. Same
// envelope convention as compliance.js: callers should check
// `res.ok` before touching the payload.

import { httpGetJson, httpPostJson } from "./http";

const BASE = "/api/v1/patch-management";

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
