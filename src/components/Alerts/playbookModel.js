// src/components/Alerts/playbookModel.js
//
// ADR-0034 F2 — cómo se lee un playbook en pantalla. Las reglas viven en el
// backend (modules/playbooks/playbook-model.ts); aquí sólo se pinta, y se hace
// una comprobación de cortesía para no mandar lo que seguro se rechaza.

import { PROBES, PROBE_BY_KEY, paramsForRequest, paramsProblem, emptyParams } from "../liveQuery/liveQueryModel";
import { SOURCE_LABEL } from "./alertSources";

export { PROBES, PROBE_BY_KEY, emptyParams, paramsForRequest, paramsProblem };

export const SEVERITIES = ["info", "low", "medium", "high", "critical"];

export const MODE_LABEL = { dry_run: "Rehearsal", armed: "Armed" };

/** Lo que significa cada desenlace de una corrida, en una línea. */
export const DECISION_LABEL = {
  executed: "Acted",
  dry_run: "Would have acted",
  skipped: "Held back",
  partial: "Acted, with a failure",
  failed: "Failed",
};

export const ACTION_LABEL = { live_query: "Ask the device", remediate: "Remediate the check" };

/** El motivo por el que un freno paró una corrida, en palabras. */
export function skipReasonLabel(raw) {
  const reason = String(raw ?? "");
  const [key, arg] = reason.split(":");
  if (key === "cooldown") return `Cooldown — this device was already handled in the last ${arg}`;
  if (key === "devices_per_tick_cap") return `Above the per-run cap of ${arg} devices`;
  if (key === "runs_per_day_cap") return `Daily cap of ${arg} runs reached — the playbook paused itself`;
  if (key === "permission_revoked") return `Whoever armed it no longer has: ${String(arg ?? "").split(",").join(", ")}`;
  return reason || "—";
}

/** «When a compliance alert opens (medium or worse)» */
export function triggerSummary(trigger) {
  const sources = trigger?.sources?.length ? trigger.sources.map((s) => SOURCE_LABEL[s] || s).join(", ") : "any source";
  const sev = trigger?.minSeverity && trigger.minSeverity !== "info" ? ` (${trigger.minSeverity} or worse)` : "";
  return `When an alert opens from ${sources}${sev}`;
}

export function actionSummary(action) {
  if (!action) return "";
  if (action.kind === "live_query") return `Ask the device: ${PROBE_BY_KEY[action.probe]?.label ?? action.probe}`;
  const target = action.checkId ? action.checkId : "the check in the alert";
  return `Remediate ${target} (${action.mode === "dry_run" ? "simulate" : "apply"})`;
}

/** Qué permiso hace falta para ARMAR esto; espejo de capabilitiesForActions. */
export function capabilitiesForActions(actions = []) {
  const out = new Set();
  for (const a of actions) {
    if (a.kind === "live_query") out.add("live_query");
    if (a.kind === "remediate") out.add("patch_management");
  }
  return [...out];
}

export const CAPABILITY_LABEL = { live_query: "Live Query", patch_management: "Patch Management", playbooks: "Playbooks" };

/** Comprobación de cortesía antes de mandar; null si parece válido. */
export function playbookProblem(form) {
  if (!String(form?.name ?? "").trim()) return "Give the playbook a name.";
  if (!form?.actions?.length) return "A playbook does nothing without at least one action.";
  for (const a of form.actions) {
    if (a.kind === "live_query") {
      const problem = paramsProblem(a.probe, a.params);
      if (problem) return `Ask the device: ${problem}`;
    }
  }
  return null;
}

/** Lo que se manda al servidor. */
export function playbookBody(form) {
  return {
    name: String(form.name).trim(),
    trigger: {
      event: "alert.opened",
      sources: form.sources?.length ? form.sources : null,
      minSeverity: form.minSeverity,
      ruleIds: null,
    },
    conditions: (form.conditions ?? [])
      .filter((c) => String(c.field ?? "").trim() && String(c.value ?? "").trim())
      .map((c) => ({ field: c.field.trim(), op: c.op, value: c.value.trim() })),
    actions: form.actions.map((a) =>
      a.kind === "live_query"
        ? { kind: "live_query", probe: a.probe, params: paramsForRequest(a.probe, a.params) }
        : { kind: "remediate", mode: a.mode, checkId: String(a.checkId ?? "").trim() || null }
    ),
    guards: form.guards,
  };
}
