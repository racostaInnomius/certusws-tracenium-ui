// src/components/Compliance/complianceHelpers.js
//
// Pure remediation-lifecycle + presentation helpers shared across the
// compliance surfaces (the finding card, the status-change dialog, the device
// drawer). Extracted from the SecurityCompliance god-component so they have a
// single home and can be unit tested in isolation.

// Client-side mirror of the backend transition matrix
// (finding-lifecycle.service ALLOWED_TRANSITIONS) — drives the action menu so
// the operator only sees valid next states. The backend re-validates on 409,
// so drift here is a cosmetic UX issue, never a correctness one.
export const REMEDIATION_TRANSITIONS = {
  open: ["in_progress", "remediated", "risk_accepted", "wont_fix"],
  in_progress: ["remediated", "risk_accepted", "wont_fix", "open"],
  remediated: ["open"],
  risk_accepted: ["open"],
  wont_fix: ["open"],
};

// Terminal transitions that should require an operator note (audit quality —
// risk-acceptance without a stated reason is what auditors flag).
export const TERMINAL_TRANSITIONS_REQUIRING_NOTE = new Set(["risk_accepted", "wont_fix"]);

// Acknowledge-until presets for time-boxed exceptions. `days: null` = an
// indefinite ack (explicitly clears any prior expiry).
export const ACK_EXPIRY_PRESETS = [
  { label: "for 30 days", days: 30 },
  { label: "for 60 days", days: 60 },
  { label: "for 90 days", days: 90 },
  { label: "indefinitely", days: null },
];

/** ISO instant `days` from now, or null for an indefinite ack. */
export function ackUntilIso(days) {
  if (days == null) return null;
  return new Date(Date.now() + days * 86_400_000).toISOString();
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
