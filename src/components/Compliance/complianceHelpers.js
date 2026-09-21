// src/components/Compliance/complianceHelpers.js
//
// Pure remediation-lifecycle + presentation helpers shared across the
// compliance surfaces (the finding card, the status-change dialog, the device
// drawer). Extracted from the SecurityCompliance god-component so they have a
// single home and can be unit tested in isolation.

// Client-side mirror of the backend transition matrix
// (finding-lifecycle.service ALLOWED_TRANSITIONS) for what an operator can do
// DIRECTLY. risk_accepted / wont_fix are not here since P1-7: they are
// exceptions, requested and approved (ExceptionRequestDialog), and the backend
// answers 409 EXCEPTION_REQUEST_REQUIRED to a direct change. Leaving an
// exception (→ open) is still direct: it only tightens posture.
export const REMEDIATION_TRANSITIONS = {
  open: ["in_progress", "remediated"],
  in_progress: ["remediated", "open"],
  remediated: ["open"],
  risk_accepted: ["open"],
  wont_fix: ["open"],
};

// Kinds of exception, in the order the request dialog offers them.
export const EXCEPTION_KIND_META = {
  acknowledged: { label: "Acknowledge", description: "Known and being handled; keep it out of the way until the expiry." },
  risk_accepted: { label: "Accept risk", description: "The risk is understood and accepted; no fix planned before the expiry." },
  wont_fix: { label: "Won't fix", description: "This control does not apply here or will not be implemented." },
};

export const EXCEPTION_MAX_DAYS = 365;
export const EXCEPTION_MIN_JUSTIFICATION = 20;

/** YYYY-MM-DD for a date input, `days` from `now` (local calendar). */
export function dateInputValue(days, now = new Date()) {
  const d = new Date(now.getTime() + days * 86_400_000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Start of the chosen day in local time, as ISO — what the request sends.
 * Start, not end: "today + 365" at 00:00 is always inside the backend's
 * 365-day window, whatever the time of day the request is made.
 */
export function expiryIsoFromDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0).toISOString();
}

/**
 * Coarse relative time for "open since" / "acknowledged X ago" — compact
 * (no "ago" suffix): now / Xm / Xh / Xd / Xmo / Xy. null for invalid input.
 */
export function shortRelativeTime(isoString) {
  if (!isoString) return null;
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return null;
  const deltaMs = Date.now() - then;
  if (deltaMs < 0) return "future";
  const mins = Math.round(deltaMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.round(months / 12);
  return `${years}y`;
}

/** Short absolute date for the "Ack until <date>" chip, e.g. "Sep 30". */
export function shortDate(isoString) {
  if (!isoString) return null;
  const t = Date.parse(isoString);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── ¿Se ha verificado el arreglo? ────────────────────────────────────────
//
// `remediated` es una AFIRMACIÓN (el agente dice que aplicó el arreglo, o el
// operador lo marcó a mano): el hallazgo sigue en `fail` hasta que un escaneo
// posterior lo confirma. Pintarlo en rojo como uno sin tocar ocultaba que ya
// se había hecho algo; pintarlo como resuelto mentiría si el arreglo no
// aguanta. De ahí tres estados:
//   · "awaiting"     — arreglado, pendiente del siguiente escaneo;
//   · "did_not_hold" — un escaneo POSTERIOR al arreglo siguió en fail y el
//                      backend lo devolvió a `open` (remediationRevertedAt);
//   · null           — cualquier otro caso: la tarjeta se pinta como siempre.
// Un pass no llega aquí: el hallazgo se cierra y sale de la lista.
export function remediationVerification(finding) {
  if (!finding || finding.status !== "fail") return null;
  const status = finding.remediationStatus || "open";
  if (status === "remediated") return "awaiting";
  if (status === "open" && finding.remediationRevertedAt) return "did_not_hold";
  return null;
}
