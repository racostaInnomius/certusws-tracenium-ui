// src/api/fileIntegrity.js
//
// ADR-0027 — integridad de ficheros de un equipo (lectura). Qué vigilar se
// declara en la política (Agent Settings), no por aquí.

import { httpGetJson } from "./http";

export async function getDeviceFileIntegrity(agentId) {
  return httpGetJson(`/api/v1/file-integrity/devices/${encodeURIComponent(agentId)}`, { cache: "reload" });
}
