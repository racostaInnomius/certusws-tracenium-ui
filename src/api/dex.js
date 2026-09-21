// src/api/dex.js
//
// ADR-0030 — experiencia del equipo (recursos y estabilidad). REST en
// /api/v1/dex (capacidad `assets_view`).

import { httpGetJson } from "./http";

export async function getDeviceExperience(agentId, days = 7) {
  return httpGetJson(`/api/v1/dex/devices/${encodeURIComponent(agentId)}?days=${encodeURIComponent(days)}`, { cache: "no-store" });
}

export async function getFleetExperience() {
  return httpGetJson("/api/v1/dex/fleet", { cache: "no-store" });
}
