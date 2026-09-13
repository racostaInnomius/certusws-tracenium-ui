// src/components/Assessments/assessmentModel.js
//
// ADR-0022 — lo que la página de Assessment Service calcula sin red: textos de
// estado, cobertura, orden de hallazgos y la lectura de un «Run now» que no
// pudo arrancar. Puro, para que la página y sus tests lean lo mismo.

import { SEVERITY_RANK } from "../../theme/severity";

export const INSTANCE_STATUS = {
  detected: { label: "Detected", tone: "neutral", help: "Proposed from a domain controller with the agent. No score, no runs, no cost until you activate it." },
  active: { label: "Active", tone: "positive", help: "Counts toward the license. Runs on its schedule and on demand." },
  inactive: { label: "Inactive", tone: "muted", help: "Deactivated. History and findings are kept; nothing runs." },
  orphaned: { label: "Orphaned", tone: "caution", help: "The last domain controller with the agent was decommissioned. History is kept; nothing runs until you activate it with a new collector." },
};

export const RUN_STATUS = {
  running: { label: "Running", tone: "neutral" },
  complete: { label: "Complete", tone: "positive" },
  incomplete: { label: "Incomplete", tone: "caution" },
  missed: { label: "Missed", tone: "critical" },
  failed: { label: "Failed", tone: "critical" },
};

export const VERDICT = {
  fail: { label: "Fail", tone: "critical" },
  needs_review: { label: "Needs review", tone: "caution" },
  not_assessed: { label: "Not assessed", tone: "muted" },
  not_applicable: { label: "Not applicable", tone: "muted" },
  pass: { label: "Pass", tone: "positive" },
};

const VERDICT_ORDER = { fail: 0, needs_review: 1, not_assessed: 2, not_applicable: 3, pass: 4 };

/** "29 of 30 assessable from this collector" — la cobertura se enseña, no se esconde. */
export function coverageText(coverage) {
  if (!coverage || !Number.isFinite(coverage.total) || coverage.total === 0) return "—";
  return `${coverage.assessable} of ${coverage.total} assessable from this collector`;
}

/**
 * Por qué un indicador no se pudo evaluar, en palabras. El motivo lo escribe el
 * agente (`requires_privileged_read:0x8007200A`), y la parte antes de `:` es
 * estable; el HRESULT se deja visible para soporte.
 */
export function notAssessedReason(reason) {
  const raw = String(reason || "");
  const [head, detail] = [raw.split(":")[0], raw.split(":").slice(1).join(":")];
  switch (head) {
    case "requires_privileged_read":
      return `The collector's machine account cannot read this (${detail || "no read right"}). It needs privileged credentials, which Assessment Service does not store.`;
    case "requires_dc_registry":
      return "This check reads the registry of a domain controller and the collector is not one.";
    case "insufficient_rights":
      return `Access was denied to the collector (${detail}).`;
    case "budget_exceeded":
      return "The run reached its time budget before this check.";
    case "missing_evidence":
      return "The directory did not return the data this check needs.";
    case "collector_error":
      return `The collector reported an error (${detail}).`;
    case "collector_no_result":
      return "The collector returned no result for this check.";
    default:
      return raw || "Not assessed.";
  }
}

/** Hallazgos vivos: primero lo que falla, por criticidad; lo que pasa, al final. */
export function sortFindings(findings) {
  return [...(Array.isArray(findings) ? findings : [])].sort((a, b) => {
    const v = (VERDICT_ORDER[a.status] ?? 9) - (VERDICT_ORDER[b.status] ?? 9);
    if (v !== 0) return v;
    const s = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (s !== 0) return s;
    return String(a.controlId).localeCompare(String(b.controlId));
  });
}

/** Recuento de hallazgos ABIERTOS por criticidad (fail + needs_review). */
export function openBySeverity(findings) {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of Array.isArray(findings) ? findings : []) {
    if ((f.status === "fail" || f.status === "needs_review") && out[f.severity] !== undefined) out[f.severity] += 1;
  }
  return out;
}

/**
 * La respuesta de «Run now». El backend contesta 202 con la corrida, o 409:
 *   ASP_COLLECTOR_UNAVAILABLE → la corrida quedó `missed` (visible), y se dice;
 *   ASP_RUN_IN_PROGRESS       → ya hay una en curso.
 */
export function describeRunNow(result, error) {
  if (error) {
    const code = error?.body?.error || error?.code;
    if (code === "ASP_COLLECTOR_UNAVAILABLE") {
      return { severity: "warning", message: `No collector was online, so the run was recorded as missed. ${error?.body?.message || ""}`.trim() };
    }
    if (code === "ASP_RUN_IN_PROGRESS") return { severity: "info", message: "A run is already in progress for this domain." };
    return { severity: "error", message: error?.body?.message || error?.message || "The run could not be started." };
  }
  const collector = result?.run?.collectorDeviceId;
  return { severity: "success", message: `Run started${collector ? " on the collector" : ""}. Results appear when the domain controller finishes uploading.` };
}

export function scheduleText(schedule) {
  if (!schedule || typeof schedule !== "object") return "Weekly";
  const f = schedule.frequency;
  if (f === "manual") return "Manual";
  const hour = Number.isInteger(schedule?.window?.startHour) ? `${String(schedule.window.startHour).padStart(2, "0")}:00 UTC` : "02:00 UTC";
  const days = Array.isArray(schedule?.window?.days) && schedule.window.days.length ? schedule.window.days.join(", ") : "sun";
  if (f === "daily") return `Daily · ${hour}`;
  if (f === "monthly") return `Monthly · first ${days} · ${hour}`;
  return `Weekly · ${days} · ${hour}`;
}
