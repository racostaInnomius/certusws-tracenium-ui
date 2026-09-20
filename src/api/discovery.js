// src/api/discovery.js
//
// Cobertura: qué equipos existen en Active Directory y cuáles no tienen
// agente. REST en /api/v1/discovery — leer con `assets_view`, lanzar una
// lectura y sacar el paquete de instalación con ADMIN/OWNER.

import { httpGetJson, httpPostJson } from "./http";

const BASE = "/api/v1/discovery";

/** Resumen, equipos descubiertos y últimas lecturas. */
export async function getCoverage(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, String(v));
  const qs = q.toString();
  return httpGetJson(`${BASE}/coverage${qs ? `?${qs}` : ""}`, { cache: "reload" });
}

/** «Buscar ahora». 409 con código si no hay colector online o ya hay una lectura en curso. */
export async function runDiscoveryNow() {
  return httpPostJson(`${BASE}/run`, {});
}

/** Marcar equipos como invitados, ignorados o de vuelta a pendientes. */
export async function setDiscoveryInstallState(keys, installState, note = null) {
  return httpPostJson(`${BASE}/devices/state`, { keys, installState, note });
}

/**
 * Pide el paquete para instalar el agente en los equipos seleccionados.
 * ⚠️ El código de alta que devuelve se enseña UNA vez: el servidor sólo guarda
 * su huella.
 */
export async function getDiscoveryInstallPackage(keys) {
  return httpPostJson(`${BASE}/install-package`, { keys });
}
