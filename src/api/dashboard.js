import { httpGetJson } from "./http";

export const dashboardApi = {
  getSummary: () => httpGetJson("/api/v1/dashboard/summary"),
  // De cuántos equipos NO podemos afirmar nada: por cada señal, quién reporta,
  // quién lleva demasiado callado y quién no reportó nunca. Complementa al
  // descubrimiento de AD, que cuenta los equipos del dominio SIN agente.
  getSignalCoverage: () => httpGetJson("/api/v1/dashboard/signal-coverage"),
  // Último check-in + "Needs attention" del Dashboard de Asset Management.
  getAssetHealth: () => httpGetJson("/api/v1/dashboard/asset-health"),
  // Quiénes son los equipos del hueco de UNA señal (never/stale), para que
  // "5 silent for over 3 days" tenga nombres.
  getSignalGapDevices: (signal) =>
    httpGetJson(`/api/v1/dashboard/signal-coverage/${encodeURIComponent(signal)}/devices`),
  getHosts: () => httpGetJson("/api/v1/dashboard/hosts"),
  // Map view. Unpaginated by design — see fetchHostLocations in the backend.
  getHostLocations: () => httpGetJson("/api/v1/dashboard/hosts/locations"),
  getPrinters: () => httpGetJson("/api/v1/dashboard/printers"),
  getHostDetail: (agentId) => httpGetJson(`/api/v1/dashboard/hosts/${encodeURIComponent(agentId)}/detail`),
  // Per-device printer list. Returns rows from the device_printers
  // projection (populated from agent 1.1.20+ FACTS via the new
  // amp.printers field). For older agents the projection has no rows
  // for that device — returns an empty array.
  //
  // `include=scan` asks for `{ items, scan }`: scan carries the Windows read
  // scopes that separate "could not read" from "has no printers". A backend
  // that predates it ignores the parameter and returns the bare array, so
  // read the response through normalizeHostPrintersResponse.
  getHostPrinters: (agentId) =>
    httpGetJson(`/api/v1/dashboard/hosts/${encodeURIComponent(agentId)}/printers?include=scan`),
  // Cambios de hardware detectados al ingerir: `{ available, baselineAt, changes }`.
  // baselineAt null = el equipo aún no envió inventario desde que existe la
  // detección; NO es "sin cambios".
  getHostHardwareChanges: (agentId) =>
    httpGetJson(`/api/v1/dashboard/hosts/${encodeURIComponent(agentId)}/hardware-changes`)
};