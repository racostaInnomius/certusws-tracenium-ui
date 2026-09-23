// src/components/patch-management/rollbackPoints.js
//
// Lo que el panel de puntos de restauración dice de cada snapshot. PURO.
//
// ⚠️ POR QUÉ EXISTE (22-sep-2026). Un snapshot de un parche fallido se
// conservaba «para que decida una persona», pero la única decisión posible era
// revertir: vivía para siempre, y los de parches de SO ni siquiera se veían en
// ninguna pantalla. Ahora se puede LIBERAR (validado, fallo asumido, sobra) y
// AMPLIAR hasta un tope — 72 h por defecto, 7 días como máximo, medido desde
// que se tomó.
//
// El ESTADO no se calcula aquí: llega del backend, que lo saca de la misma
// decisión que usa el barrido. Aquí sólo se pone en palabras.

const HOUR = 3_600_000;

/** Cómo se presenta cada estado. `tone` = la paleta del resto de la app. */
export const STATE_META = Object.freeze({
  needs_decision: {
    label: "Needs your decision",
    tone: "critical",
    hint: "The patch failed. Revert to the snapshot, or release it if the failure is accepted.",
  },
  awaiting_reboot: {
    label: "Waiting for restart",
    tone: "caution",
    hint: "The patch asked for a restart and the server has not booted since. Kept until it does — or until you decide.",
  },
  patch_in_progress: {
    label: "Patch running",
    tone: "info",
    hint: "Kept while the patch runs. It cannot be released until the patch finishes.",
  },
  // ⚠️ NO es un fallo (23-sep-2026). El agente dejó de esperar a Windows Update
  // —o venció el plazo del job— y Windows siguió instalando por su cuenta: en
  // campo, esos parches acabaron entrando. Hasta que un escaneo lo confirme no
  // hay nada que decidir; antes esto salía como «Needs your decision» sobre
  // parches que ya estaban instalados.
  verifying: {
    label: "Checking the result",
    tone: "info",
    hint: "The install ran past our time limit and Windows may have finished it anyway. Kept until a scan shows whether the patch landed — no decision needed yet.",
  },
  auto_release: {
    label: "Removed automatically",
    tone: "neutral",
    hint: "The patch went fine. Extend it if you still need to validate the application, or release it once you have.",
  },
  released: {
    label: "Released — removal queued",
    tone: "muted",
    hint: "Released by an operator. It disappears once vCenter confirms the snapshot is gone.",
  },
});

export function stateMeta(state) {
  return STATE_META[state] ?? { label: String(state || "Unknown"), tone: "neutral", hint: "" };
}

/** «2 days» / «5 h» / «less than 1 h». */
export function humanDuration(ms) {
  const h = Math.floor(Math.abs(ms) / HOUR);
  if (h < 1) return "less than 1 h";
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} days`;
}

/**
 * La frase de la fecha, que depende del estado: un snapshot que se borra solo
 * dice CUÁNDO; uno retenido pasada su fecha dice CUÁNTO lleva de más.
 */
export function deadlineText(point, now = Date.now()) {
  const deadline = Date.parse(point?.deadline ?? "");
  if (!Number.isFinite(deadline)) return "";
  const left = deadline - now;

  if (point.state === "released") return "Removal queued";
  if (point.state === "auto_release") {
    return left > 0 ? `Removed automatically in ${humanDuration(left)}` : "Removal due now";
  }
  // Retenido esperando algo: su fecha ya no dice cuándo se va.
  return left > 0 ? `Due in ${humanDuration(left)}` : `Kept ${humanDuration(left)} past its date`;
}

/** ¿Ha pasado del tope de la política? Entonces ocupa más de lo permitido. */
export function isPastCap(point, now = Date.now()) {
  const maxUntil = Date.parse(point?.maxUntil ?? "");
  return Number.isFinite(maxUntil) && now > maxUntil;
}

export function canRelease(point) {
  return point?.state !== "released" && point?.state !== "patch_in_progress";
}

export function canExtend(point, now = Date.now()) {
  if (point?.state === "released") return false;
  const maxUntil = Date.parse(point?.maxUntil ?? "");
  const deadline = Date.parse(point?.deadline ?? "");
  // Sólo si queda margen de verdad: ampliar a lo que ya hay no amplía nada.
  return Number.isFinite(maxUntil) && Number.isFinite(deadline) && maxUntil > Math.max(deadline, now);
}

export function canRevert(point) {
  return point?.state !== "released";
}

/**
 * Las opciones del diálogo de ampliar: +24 h, +48 h y «hasta el tope», desde la
 * fecha actual (o desde ahora si ya pasó), recortadas al tope y sin duplicados.
 * Sólo las que alargan algo.
 */
export function extendChoices(point, now = Date.now()) {
  const maxUntil = Date.parse(point?.maxUntil ?? "");
  const deadline = Date.parse(point?.deadline ?? "");
  if (!Number.isFinite(maxUntil) || !Number.isFinite(deadline)) return [];
  const from = Math.max(deadline, now);

  const raw = [
    { label: "24 more hours", at: from + 24 * HOUR },
    { label: "48 more hours", at: from + 48 * HOUR },
    { label: `Until the limit (${point.maxHoldHours} h after it was taken)`, at: maxUntil },
  ];
  const seen = new Set();
  const out = [];
  for (const c of raw) {
    const at = Math.min(c.at, maxUntil);
    if (at <= from || seen.has(at)) continue;
    seen.add(at);
    out.push({
      label: at === maxUntil && c.at !== maxUntil ? `${c.label} — capped at the limit` : c.label,
      untilIso: new Date(at).toISOString(),
    });
  }
  return out;
}

/** Por qué se libera: tres frases que un auditor entiende. */
export const RELEASE_REASONS = Object.freeze([
  {
    value: "validated",
    label: "Validated",
    description: "The patched server was used and works. The rollback point is no longer needed.",
  },
  {
    value: "accepted_failure",
    label: "Failure accepted",
    description: "The patch did not apply cleanly, but it will not be reverted (fixed another way, or retried later).",
  },
  {
    value: "not_needed",
    label: "Not needed",
    description: "This rollback point is not worth keeping — for example, the server holds no state worth protecting.",
  },
]);

/**
 * La razón que el diálogo propone de entrada, según el estado.
 *
 * ⚠️ «Validated» sobre un parche FALLIDO sería una afirmación falsa en la
 * auditoría con un solo clic: lo que se hace con un fallo es asumirlo. Y de un
 * servidor que no ha vuelto a arrancar nadie ha validado nada todavía.
 */
export function defaultReleaseReason(state) {
  if (state === "needs_decision") return "accepted_failure";
  if (state === "awaiting_reboot") return "not_needed";
  return "validated";
}

/**
 * El aviso antes de revertir, con la cuenta hecha. Revertir tarde en un
 * servidor con datos (contabilidad, ficheros, un controlador de dominio) borra
 * todo lo escrito desde el snapshot: se dice CUÁNTO.
 */
export function revertWarning(point, now = Date.now()) {
  const taken = Date.parse(point?.takenAt ?? "");
  if (!Number.isFinite(taken)) {
    return "Reverting discards everything written to this server since the snapshot was taken.";
  }
  return `Reverting discards everything written to this server in the last ${humanDuration(now - taken)} — since the snapshot was taken. On a server that holds data (accounting, files, a domain controller) uninstalling the update is usually the safer way back.`;
}
