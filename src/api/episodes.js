// src/api/episodes.js
//
// Línea de tiempo de ubicación (ADR-0018). Dos preguntas sobre la misma tabla:
// dónde ha estado un equipo, y quién estuvo en un sitio.
//
// ⚠️ La respuesta trae `beyondRetention` y `retentionDays`. NO es un detalle de
// implementación: distingue "no hay estancias" de "ya no se guarda", y la
// segunda tiene que decirse — una lista vacía se leería como "no estuvo en
// ningún sitio", que es una afirmación sobre el paradero de alguien.

import { httpGetJson } from "./http";

export async function getDeviceTimeline(agentId, { from, to } = {}) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  return httpGetJson(
    `/api/v1/dashboard/devices/${encodeURIComponent(agentId)}/timeline${qs ? `?${qs}` : ""}`,
    { cache: "reload" }
  );
}

export async function getSiteAttendance(siteId, { from, to } = {}) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  return httpGetJson(
    `/api/v1/dashboard/sites/${encodeURIComponent(siteId)}/attendance${qs ? `?${qs}` : ""}`,
    { cache: "reload" }
  );
}
