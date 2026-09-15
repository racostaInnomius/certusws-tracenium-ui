// src/components/AgentSettings/adPrinterCollector.js
//
// ADR-0023 — lo que el panel del colector deriva de la API, puro para probarlo
// sin DOM. La regla de siempre: un fallo se dice con su motivo, y «no hay
// equipo online» no se pinta igual que «el dominio no publica impresoras».

import { BRAND } from "../../theme/brand";

/** Texto de un equipo en el selector: nombre, y lo que le impide o no correr. */
export function candidateLabel(candidate, minAgentVersion) {
  if (!candidate) return "";
  const name = candidate.hostname || candidate.deviceId;
  const notes = [];
  if (!candidate.supported) {
    notes.push(candidate.agentVersion ? `agent ${candidate.agentVersion}, needs ${minAgentVersion}` : `agent version unknown, needs ${minAgentVersion}`);
  }
  if (!candidate.online) notes.push("offline");
  return notes.length ? `${name} · ${notes.join(" · ")}` : name;
}

const API_ERRORS = {
  AD_PRINTERS_COLLECTOR_UNAVAILABLE:
    "Neither the primary nor the backup device is online. The attempt was recorded as missed; the daily schedule tries again in 2 hours.",
  AD_PRINTERS_AGENT_TOO_OLD: "The collector that is online runs an agent too old for this read. Update the agent on that device.",
  AD_PRINTERS_RUN_IN_PROGRESS: "A read is already running.",
  AD_PRINTERS_NO_COLLECTOR: "Choose a collector device first.",
  AD_PRINTERS_DEVICE_NOT_ELIGIBLE: "That device is not a Windows device of this fleet.",
  AD_PRINTERS_SECONDARY_EQUALS_PRIMARY: "The backup has to be a different device.",
  AD_PRINTERS_PRIMARY_REQUIRED: "Choose a primary device.",
};

export function apiErrorMessage(err, fallback = "The request failed.") {
  const code = err?.body?.error || err?.code;
  return API_ERRORS[code] || err?.body?.message || err?.message || fallback;
}

/**
 * Motivo legible de una corrida que no terminó bien.
 * ⚠️ El texto crudo se conserva al final: un motivo nuevo del agente no puede
 * convertirse en «unknown error».
 */
export function describeRunError(error) {
  if (!error) return null;
  const e = String(error);
  if (e === "collector_unavailable") return "No collector device was online.";
  if (e === "not_domain_joined") return "The collector is not joined to a domain, so there is no directory to read.";
  if (e === "no_result_within_ttl") return "The collector never sent a result.";
  if (e.startsWith("requires_agent:")) return `The collector's agent is older than ${e.slice("requires_agent:".length)}.`;
  if (e.startsWith("collector_did_not_receive_job")) return "The collector went offline before receiving the request.";
  if (e.includes("script_untrusted")) return "The collector rejected the read script's signature.";
  if (e.includes("script_timeout")) return "The directory did not answer in time.";
  if (e.includes("not_collector")) return "The device was no longer the collector when the request arrived.";
  return e;
}

export const RUN_STATUS = {
  // Letra con los tokens *Text sobre su relleno *Soft: ROLE.* es relleno, no letra.
  running: { label: "Running", color: BRAND.alert.infoText, bg: BRAND.alert.infoSoft },
  complete: { label: "Complete", color: BRAND.alert.successText, bg: BRAND.alert.successSoft },
  failed: { label: "Failed", color: BRAND.alert.errorText, bg: BRAND.alert.errorSoft },
  missed: { label: "Missed", color: BRAND.alert.warningText, bg: BRAND.alert.warningSoft },
};

/** Una línea de resumen de la última corrida completa, o null si no hay ninguna. */
export function lastReadSummary(status) {
  const runs = Array.isArray(status?.runs) ? status.runs : [];
  const done = runs.find((r) => r.status === "complete");
  if (!done) return null;
  const n = Number(done.queuesCount ?? 0);
  return {
    domain: done.domain,
    queues: n,
    text: `${n} print ${n === 1 ? "queue" : "queues"} published in ${done.domain}`,
    finishedAt: done.finishedAt,
  };
}

/** ¿Hay que seguir preguntando? Sólo mientras la última corrida esté en curso. */
export function shouldPoll(status) {
  return Array.isArray(status?.runs) && status.runs[0]?.status === "running";
}
