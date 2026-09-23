import { httpDeleteJson, httpGetJson, httpPutJson } from "./http";
import { buildQuery } from "./query";


const BASE = "/api/v1/dashboard";

export async function getInactiveAssets(params = {}) {
  return httpGetJson(`${BASE}/inactive-assets${buildQuery(params)}`);
}

export async function getHardwareInventorySummary() {
  return httpGetJson(`${BASE}/hardware-inventory/summary`);
}

export async function getHardwareInventoryRankings() {
  return httpGetJson(`${BASE}/hardware-inventory/rankings`);
}

export async function getHardwareInventoryDetail(params = {}) {
  return httpGetJson(
    `${BASE}/hardware-inventory/detail${buildQuery(params)}`
  );
}

export async function getSoftwareInventorySummary() {
  return httpGetJson(`${BASE}/software-inventory/summary`);
}

export async function getSoftwareInventoryRankings() {
  return httpGetJson(`${BASE}/software-inventory/rankings`);
}

export async function getSoftwareInventoryDetail(params = {}) {
  return httpGetJson(
    `${BASE}/software-inventory/detail${buildQuery(params)}`
  );
}

export async function getSoftwareInventoryHosts(params = {}) {
  return httpGetJson(`${BASE}/software-inventory/hosts${buildQuery(params)}`);
}

export async function getSoftwareInventoryHostApps(agentId, params = {}) {
  return httpGetJson(
    `${BASE}/software-inventory/hosts/${encodeURIComponent(agentId)}/apps${buildQuery(params)}`
  );
}

// Browser inventory — fleet posture per browser family (versions + how many
// devices are behind the newest version in the fleet). Its own top-level path,
// not under /dashboard.
export async function getBrowserInventory() {
  return httpGetJson("/api/v1/browser-inventory");
}

// Extensions installed in Chrome / Edge / Firefox across the fleet, one row per
// extension with its permission-based risk and where it is installed.
export async function getBrowserExtensions() {
  return httpGetJson("/api/v1/browser-inventory/extensions");
}
// GPOs de Windows aplicadas a cada equipo. Es inventario, no cumplimiento:
// se mostraba dentro del cajón de Security Compliance porque el dato viajaba
// como evidencia de un hallazgo, que describe cómo se construyó y no lo que es.
export async function getWindowsGpoInventory() {
  return httpGetJson(`${BASE}/windows-gpos`);
}

// El historial: qué directiva entró o salió de cada equipo, y cuándo. La foto
// de arriba dice qué hay hoy; esto dice qué cambió, que es la pregunta que
// trae a alguien a esta pantalla.
export async function getWindowsGpoChanges(days = 30) {
  return httpGetJson(`${BASE}/windows-gpos/changes?days=${encodeURIComponent(days)}`, { cache: "no-store" });
}

// Impresoras de la flota agrupadas en colas, con impresoras físicas por
// dirección y la cobertura de lectura. Pestaña Asset Management → Printers.
export async function getPrinterFleet() {
  return httpGetJson(`${BASE}/printers/fleet`);
}

// Block / allow rules for Chrome and Edge extensions. They live in the tenant
// policy: saving one reaches every Windows device on its next check-in.
export async function getExtensionRules() {
  return httpGetJson("/api/v1/browser-inventory/extension-rules");
}

export async function putExtensionRule(rule) {
  return httpPutJson("/api/v1/browser-inventory/extension-rules", rule);
}

export async function deleteExtensionRule(browser, extensionId) {
  return httpDeleteJson(
    `/api/v1/browser-inventory/extension-rules/${encodeURIComponent(browser)}/${encodeURIComponent(extensionId)}`
  );
}

// Chrome Enterprise connector (Pub/Sub push). PUT returns the push endpoint URL
// ONCE — it carries the token; later reads never include it.
export async function getChromeConnector() {
  return httpGetJson("/api/v1/browser-telemetry/chrome-connector");
}

export async function putChromeConnector(pushServiceAccount) {
  return httpPutJson("/api/v1/browser-telemetry/chrome-connector", { pushServiceAccount });
}

export async function deleteChromeConnector() {
  return httpDeleteJson("/api/v1/browser-telemetry/chrome-connector");
}
