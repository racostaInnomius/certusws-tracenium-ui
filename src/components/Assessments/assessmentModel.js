// src/components/Assessments/assessmentModel.js
//
// ADR-0022 — lo que la página de Assessment Suite calcula sin red: textos de
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
      return `The collector's machine account cannot read this (${detail || "no read right"}). It needs privileged credentials, which Assessment Suite does not store.`;
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
    case "requires_agent":
      return `The collector's agent is too old for this check. It runs once the domain controller has agent ${detail || "a newer version"} or later.`;
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

// ── Gauge del score ────────────────────────────────────────────────────────

/**
 * El objetivo que se enseña. Sin objetivo propio de la instancia, el umbral
 * «On track» de las bandas del tenant: el mismo número que ya colorea los
 * scores, no uno inventado para la ocasión.
 */
export function effectiveTarget(instance, bands) {
  const own = Number(instance?.targetScore);
  if (Number.isInteger(own) && own >= 1 && own <= 100) return { value: own, source: "instance" };
  return { value: bands.goodMin, source: "bands" };
}

/**
 * Variación contra la corrida puntuada anterior (history va de antigua a
 * reciente). `null` con una sola corrida: no hay contra qué comparar.
 */
export function scoreDelta(history) {
  const h = (history || []).filter((x) => Number.isFinite(x?.score));
  if (h.length < 2) return null;
  const last = h[h.length - 1];
  const prev = h[h.length - 2];
  return { delta: last.score - prev.score, previousScore: prev.score, previousAt: prev.scoredAt };
}

/** «34 points to target» / «Target met». */
export function targetGapText(score, target) {
  if (!Number.isFinite(score)) return "No score yet";
  const gap = target - score;
  if (gap <= 0) return gap === 0 ? "Target met" : `Target met · ${-gap} above`;
  return `${gap} ${gap === 1 ? "point" : "points"} to target`;
}

/** «Fix the 1 critical finding» / «Fix the 4 critical and high findings». */
export function projectionLabel(projection) {
  const sev = projection.severities.length === 1 ? projection.severities[0] : projection.severities.join(" and ");
  return `Fix the ${projection.fixes} ${sev} ${projection.fixes === 1 ? "finding" : "findings"}`;
}

/**
 * Una línea de la evidencia. Los indicadores de permisos y de dueño no traen
 * DN sueltos sino quién es y qué alcanza: enseñar sólo el nombre tiraba el dato
 * que decide la acción («D\helpdesk» no dice nada; «D\helpdesk — 7 objects»
 * sí).
 */
export function evidenceLine(entry) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return String(entry ?? "");
  const who = entry.name || entry.sid || "(unresolved)";
  const parts = [];
  if (entry.rights) parts.push(String(entry.rights));
  if (Number.isFinite(entry.objects)) parts.push(`${entry.objects} ${entry.objects === 1 ? "object" : "objects"}`);
  const detail = parts.length > 0 ? ` — ${parts.join(" · ")}` : "";
  const example = entry.exampleDn ? ` (e.g. ${entry.exampleDn})` : "";
  return `${who}${detail}${example}`;
}

/** Cuántos hallazgos tienen una excepción VIVA (el backend marca `active`). */
export function liveExceptionCount(findings) {
  return (Array.isArray(findings) ? findings : []).filter((f) => f?.exception?.active === true).length;
}

/**
 * La lectura del score ajustado, o null si no hay nada que decir: sin
 * excepciones vivas el ajustado es el bruto, y repetir el mismo número dos
 * veces sólo confunde.
 */
export function adjustedScoreText(score, scoreAdjusted, liveExceptions) {
  if (!Number.isFinite(scoreAdjusted) || !Number.isFinite(score)) return null;
  if (liveExceptions <= 0 || scoreAdjusted === score) return null;
  const n = liveExceptions === 1 ? "1 accepted exception" : `${liveExceptions} accepted exceptions`;
  return `${scoreAdjusted} with ${n}`;
}

/**
 * Cómo se lee una excepción del historial.
 *
 * Los cuatro estados no son cuatro adornos: `expired` se cumplió tal como se
 * concedió y `revoked` se cortó antes, y para un auditor esa diferencia es el
 * dato. Por eso el backend NO cierra la caducada, y por eso aquí tampoco se
 * juntan las dos bajo un «ya no está».
 */
export const EXCEPTION_STATUS = {
  active: { label: "In force", tone: "caution" },
  expired: { label: "Expired", tone: "muted" },
  revoked: { label: "Revoked", tone: "muted" },
  superseded: { label: "Replaced", tone: "muted" },
};

function day(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}

/**
 * "ana · 2026-09-24 → 2026-12-23 · revoked by bruno on 2026-10-01".
 * Una sola línea por excepción: quién, desde cuándo, hasta cuándo y, si
 * terminó antes de tiempo, quién la cortó y cuándo.
 */
export function exceptionHistoryLine(entry) {
  if (!entry || typeof entry !== "object") return "";
  const parts = [entry.author || "(unknown)"];
  const from = day(entry.createdAt);
  const to = day(entry.expiresAt);
  if (from && to) parts.push(`${from} → ${to}`);
  else if (to) parts.push(`until ${to}`);
  const closed = day(entry.closedAt);
  if (closed && (entry.status === "revoked" || entry.status === "superseded")) {
    const verb = entry.status === "revoked" ? "revoked" : "replaced";
    parts.push(entry.closedBy ? `${verb} by ${entry.closedBy} on ${closed}` : `${verb} on ${closed}`);
  }
  return parts.join(" · ");
}

/**
 * Qué puede hacer QUIEN MIRA con la excepción de un hallazgo.
 *
 * ⚠️ Esto es una comodidad de la interfaz, no la seguridad: el backend vuelve a
 * comprobarlo y devuelve 403. Se calcula aquí para no enseñar un botón
 * «Approve» que va a fallar, que es peor que no enseñarlo.
 *
 * La regla es la de SCP: decide un OWNER/ADMIN activo DISTINTO de quien la
 * pidió. Por eso `mine` no es un detalle — es la mitad de la regla.
 */
export function exceptionGate(finding, viewer) {
  const pending = finding?.pendingException || null;
  const active = finding?.exception?.active === true ? finding.exception : null;
  const me = String(viewer?.subject || viewer?.email || "");
  const isApprover = viewer?.role === "OWNER" || viewer?.role === "ADMIN";
  if (pending) {
    // Sin identidad del que mira no se puede demostrar que NO la pidió él, así
    // que se enseña el botón y decide el backend. La alternativa —esconderlo—
    // dejaría sin aprobar a cualquiera cuyo auth no traiga subject ni email.
    const mine = !!me && String(pending.requestedBy || "") === me;
    return {
      mode: "pending",
      pending,
      active,
      canDecide: isApprover && !mine,
      canCancel: mine || isApprover,
      // Lo que explica por qué no hay botón, en vez de una ausencia muda.
      blockedReason: mine
        ? "You asked for this exception. Someone else has to approve it."
        : isApprover
          ? null
          : "Only an owner or admin of this tenant can approve an exception.",
    };
  }
  return { mode: active ? "granted" : "none", pending: null, active, canDecide: false, canCancel: false, blockedReason: null };
}

/** "Waiting for approval · asked by ana on 2026-09-24 · risk owner ciso@acme.com" */
export function pendingRequestLine(pending) {
  if (!pending) return "";
  const parts = [];
  const who = pending.requestedBy || "(unknown)";
  const when = day(pending.requestedAt);
  parts.push(when ? `asked by ${who} on ${when}` : `asked by ${who}`);
  if (pending.riskOwner) parts.push(`risk owner ${pending.riskOwner}`);
  const to = day(pending.expiresAt);
  if (to) parts.push(`would expire ${to}`);
  return parts.join(" · ");
}
