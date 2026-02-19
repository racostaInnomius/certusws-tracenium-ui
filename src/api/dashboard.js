import { httpGetJson } from "./http";

export const dashboardApi = {
  getSummary: () => httpGetJson("/api/v1/dashboard/summary"),
  getHosts: () => httpGetJson("/api/v1/dashboard/hosts"),
  getPrinters: () => httpGetJson("/api/v1/dashboard/printers")
};