import { httpGetJson } from "./http";

export const dashboardApi = {
  getSummary: () => httpGetJson("/api/v1/dashboard/summary"),
  getHosts: () => httpGetJson("/api/v1/dashboard/hosts"),
  // Map view. Unpaginated by design — see fetchHostLocations in the backend.
  getHostLocations: () => httpGetJson("/api/v1/dashboard/hosts/locations"),
  getPrinters: () => httpGetJson("/api/v1/dashboard/printers"),
  getHostDetail: (agentId) => httpGetJson(`/api/v1/dashboard/hosts/${encodeURIComponent(agentId)}/detail`),
  // Per-device printer list. Returns rows from the device_printers
  // projection (populated from agent 1.1.20+ FACTS via the new
  // amp.printers field). For older agents the projection has no rows
  // for that device — returns an empty array.
  getHostPrinters: (agentId) =>
    httpGetJson(`/api/v1/dashboard/hosts/${encodeURIComponent(agentId)}/printers`)
};