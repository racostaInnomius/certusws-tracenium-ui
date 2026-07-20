import { httpGetJson, httpPostJson } from "./http";
import { buildQuery } from "./query";

const BASE = "/api/v1/orchestrator";


export async function listKnownDevices(params = {}) {
  return httpGetJson(
    `${BASE}/known-devices${buildQuery({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      includeGroups: params.includeGroups === true ? "true" : undefined,
    })}`
  );
}

export async function listJobTypes() {
  return httpGetJson(`${BASE}/job-types`);
}

export async function listDeviceJobs(deviceId, params = {}) {
  return httpGetJson(
    `${BASE}/devices/${encodeURIComponent(deviceId)}/jobs${buildQuery(params)}`
  );
}

export async function getJob(jobId) {
  return httpGetJson(`${BASE}/jobs/${encodeURIComponent(jobId)}`);
}

export async function retryJob(jobId) {
  return httpPostJson(`${BASE}/jobs/${encodeURIComponent(jobId)}/retry`, {});
}

export async function cancelJob(jobId) {
  return httpPostJson(`${BASE}/jobs/${encodeURIComponent(jobId)}/cancel`, {});
}

export async function listTenantJobs(tenantId, params = {}) {
  return httpGetJson(
    `${BASE}/tenants/${encodeURIComponent(tenantId)}/jobs${buildQuery(params)}`
  );
}

export async function createDeviceJob(deviceId, payload) {
  return httpPostJson(
    `${BASE}/devices/${encodeURIComponent(deviceId)}/jobs`,
    payload
  );
}

export async function createTenantJobs(tenantId, payload) {
  return httpPostJson(
    `${BASE}/tenants/${encodeURIComponent(tenantId)}/jobs`,
    payload
  );
}