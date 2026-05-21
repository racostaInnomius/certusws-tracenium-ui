// src/api/devices.js
//
// Device lifecycle/decommission API helpers.
// Keeps the device decommission workflow isolated from dashboard-specific
// inventory APIs.

import { httpGetJson, httpPostJson } from "./http";

const DEVICES_BASE = "/api/v1/devices";
const DEVICE_DECOMMISSION_JOBS_BASE = "/api/v1/device-decommission-jobs";

export async function createDeviceDecommissionJob(deviceId, payload = {}) {
  if (!deviceId) {
    throw new Error("deviceId is required to create a decommission job");
  }

  return httpPostJson(
    `${DEVICES_BASE}/${encodeURIComponent(deviceId)}/decommission-jobs`,
    payload
  );
}

export async function getDeviceDecommissionJob(jobId) {
  if (!jobId) {
    throw new Error("jobId is required to read a decommission job");
  }

  return httpGetJson(
    `${DEVICE_DECOMMISSION_JOBS_BASE}/${encodeURIComponent(jobId)}`
  );
}

export async function restoreDevice(deviceId, payload = {}) {
  if (!deviceId) {
    throw new Error("deviceId is required to restore a device");
  }

  return httpPostJson(
    `${DEVICES_BASE}/${encodeURIComponent(deviceId)}/restore`,
    payload
  );
}