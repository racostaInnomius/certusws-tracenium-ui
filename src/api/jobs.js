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

/**
 * EVERY known device in the tenant, following pagination to the end.
 *
 * ⚠️ `listKnownDevices()` with no params returns the backend's DEFAULT PAGE —
 * 25 devices. The Jobs page called it that way and used the result for three
 * things, each of which broke silently past the 25th device:
 *
 *   1. resolving a job's hostname (rows fell back to the raw device UUID);
 *   2. the target picker (devices 26+ could not be selected at all);
 *   3. `connectedDeviceIds`, which IS the payload of the "all connected
 *      devices in the tenant" dispatch — so a fleet-wide job silently hit a
 *      subset, under a count the page reported as the whole tenant.
 *
 * It went unnoticed because the tenant people looked at had 21 devices and fit
 * inside one page. The tenant that did not has 45.
 *
 * Loops rather than asking for one big page: the backend caps pageSize at 100,
 * so a single request would start lying again at 101 devices — the same shape
 * of bug, just further away. `maxPages` is a runaway guard, not a limit; if it
 * ever trips, the caller gets fewer devices and the console says so rather
 * than the page quietly under-reporting the fleet.
 */
export async function listAllKnownDevices({ pageSize = 100, maxPages = 50 } = {}) {
  const items = [];
  let page = 1;
  let total = null;

  for (; page <= maxPages; page += 1) {
    const response = await listKnownDevices({ page, pageSize });
    const batch = Array.isArray(response?.items) ? response.items : [];
    items.push(...batch);

    if (total === null && Number.isFinite(Number(response?.total))) {
      total = Number(response.total);
    }

    // Short page, empty page, or we have everything the server says exists.
    if (batch.length < pageSize) break;
    if (total !== null && items.length >= total) break;
  }

  if (page > maxPages) {
    console.warn(
      `[jobs] listAllKnownDevices stopped at ${maxPages} pages with ${items.length} devices` +
        (total !== null ? ` of ${total}` : "") +
        " — the device list is incomplete."
    );
  }

  return { ok: true, items, total: total ?? items.length };
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