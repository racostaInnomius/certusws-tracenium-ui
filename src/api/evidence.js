// src/api/evidence.js
//
// ADR-0032 — evidencia de incidente. REST en /api/v1/evidence.
//
// ⚠️ DOS PERMISOS, NO UNO. Pedir una captura es `evidence_capture`; listar,
// ver el manifiesto y descargar es `evidence_read`. La pantalla los mira por
// separado porque el backend los exige por separado: quien diagnostica puede
// disparar la captura sin poder llevarse a su equipo un fichero con las
// sesiones, los usuarios y las rutas del cliente.

import { httpGetJson, httpPostJson, httpPutJson, httpDeleteJson } from "./http";
import { buildQuery } from "./query";

/** El catálogo: qué recoge cada colector y cuál se pierde al reiniciar. */
export async function getEvidenceCollectors() {
  return httpGetJson("/api/v1/evidence/collectors", { cache: "no-store" });
}

/**
 * Pide una captura a UN equipo.
 * @param {{ deviceId: string, collectors?: string[], params?: object, reason?: string }} input
 */
export async function createEvidenceCapture(input) {
  return httpPostJson("/api/v1/evidence", input);
}

export async function listEvidenceCaptures(params = {}) {
  return httpGetJson(`/api/v1/evidence${buildQuery(params)}`, { cache: "no-store" });
}

export async function getEvidenceCapture(captureId) {
  return httpGetJson(`/api/v1/evidence/${encodeURIComponent(captureId)}`, { cache: "no-store" });
}

/** Retención por incidencia. `reason` vacío o null la suelta. */
export async function setEvidenceHold(captureId, reason) {
  return httpPutJson(`/api/v1/evidence/${encodeURIComponent(captureId)}/hold`, { reason });
}

export async function deleteEvidenceCapture(captureId) {
  return httpDeleteJson(`/api/v1/evidence/${encodeURIComponent(captureId)}`);
}

/**
 * La URL de descarga de un artefacto.
 *
 * ⚠️ No es un enlace firmado que se pueda reenviar: pasa por el backend, que
 * apunta cada descarga en la auditoría ANTES de servir los bytes. Por eso se
 * navega a ella en vez de pedir una URL temporal.
 */
export function evidenceArtifactUrl(captureId, name) {
  return `/api/v1/evidence/${encodeURIComponent(captureId)}/artifacts/${encodeURIComponent(name)}`;
}
