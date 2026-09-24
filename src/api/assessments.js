// src/api/assessments.js
//
// ADR-0022 — Assessment Suite (clave interna `asp`). REST en /api/v1/asp.
// En pantalla nunca se dicen las siglas: «Assessment Suite».

import { httpDeleteJson, httpGetJson, httpPostJson, httpPutJson } from "./http";

const BASE = "/api/v1/asp";

/** Instancias activas/inactivas/huérfanas + las `detected` aparte + licencia. */
export async function listAssessmentInstances(options = {}) {
  return httpGetJson(`${BASE}/instances`, options);
}

export async function getAssessmentInstance(id, options = {}) {
  return httpGetJson(`${BASE}/instances/${encodeURIComponent(id)}`, options);
}

/** DC con agente del dominio de la instancia, para el selector de colector. */
export async function listCollectorCandidates(id) {
  return httpGetJson(`${BASE}/instances/${encodeURIComponent(id)}/collector-candidates`, { cache: "reload" });
}

export async function activateAssessmentInstance(id, { primaryDeviceId, secondaryDeviceId = null, schedule }) {
  return httpPostJson(`${BASE}/instances/${encodeURIComponent(id)}/activate`, { primaryDeviceId, secondaryDeviceId, schedule });
}

export async function deactivateAssessmentInstance(id) {
  return httpPostJson(`${BASE}/instances/${encodeURIComponent(id)}/deactivate`, {});
}

export async function deleteAssessmentInstance(id) {
  return httpDeleteJson(`${BASE}/instances/${encodeURIComponent(id)}`);
}

/** «Run now». Un 409 ASP_COLLECTOR_UNAVAILABLE trae la corrida `missed` en el cuerpo. */
export async function runAssessmentNow(id) {
  return httpPostJson(`${BASE}/instances/${encodeURIComponent(id)}/run`, {});
}

export async function getAssessmentRun(id, runId) {
  return httpGetJson(`${BASE}/instances/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`, { cache: "reload" });
}

export async function setFindingException(id, controlId, { reason, expiresAt }) {
  return httpPutJson(`${BASE}/instances/${encodeURIComponent(id)}/findings/${encodeURIComponent(controlId)}/exception`, { reason, expiresAt });
}

export async function removeFindingException(id, controlId) {
  return httpDeleteJson(`${BASE}/instances/${encodeURIComponent(id)}/findings/${encodeURIComponent(controlId)}/exception`);
}

/**
 * Historial de excepciones de UN hallazgo (concedidas, revocadas, caducadas).
 * Endpoint aparte del detalle: el detalle trae hasta 500 hallazgos y la
 * historia sólo interesa del que se abre.
 */
export async function listFindingExceptions(id, controlId) {
  return httpGetJson(`${BASE}/instances/${encodeURIComponent(id)}/findings/${encodeURIComponent(controlId)}/exceptions`, { cache: "reload" });
}

/** Score objetivo de la instancia (1-100); `null` vuelve al umbral On track del tenant. */
export async function setAssessmentTarget(id, targetScore) {
  return httpPutJson(`${BASE}/instances/${encodeURIComponent(id)}/target`, { targetScore });
}
