import {
  httpGetJson,
  httpPostJson,
  httpPutJson,
  httpDeleteJson,
} from "./http";

const BASE = "/api/v1/software-delivery";

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      query.append(key, String(value));
    }
  });

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function listSoftwareDelivery(params = {}) {
  return httpGetJson(`${BASE}${buildQuery(params)}`);
}

export async function getSoftwareDeliveryById(id) {
  return httpGetJson(`${BASE}/${id}`);
}

export async function createSoftwareDelivery(payload) {
  return httpPostJson(BASE, payload);
}

export async function updateSoftwareDelivery(id, payload) {
  return httpPutJson(`${BASE}/${id}`, payload);
}

export async function deleteSoftwareDelivery(id) {
  return httpDeleteJson(`${BASE}/${id}`);
}

export async function resolveSoftwareDeliveryDownload(downloadPath) {
  return httpGetJson(downloadPath);
}