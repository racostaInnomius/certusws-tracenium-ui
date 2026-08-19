// src/components/Alerts/notifyHelpers.js
//
// Recipient parsing/validation for per-rule email delivery
// (alert_rules.notify_json). Kept out of the component file so it is
// unit-testable without rendering, same split as Policies/policyTransforms.
//
// Mirrors parseNotifyConfig in the backend's alert-notifier.service. The
// backend re-validates and rejects — this exists so a typo'd address is
// caught while the operator is looking at it, instead of saving
// "successfully" and then silently never delivering.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_RECIPIENTS = 20;
export const SEVERITIES = ["low", "medium", "high", "critical"];

/**
 * Roles a rule can target, matching TenantMember.Role.
 *
 * Targeting a role is the recommended path, and not for convenience:
 * the address is read from TenantMember at send time, so someone who
 * leaves the tenant stops being notified without anyone editing the
 * rule. A typed-in address keeps arriving until a human remembers it.
 */
export const NOTIFY_ROLES = ["OWNER", "ADMIN", "USER"];

/**
 * Delivery channels. `console` is not a delivery — it is the feed, where
 * everything a rule matches always appears. It is in the list because
 * ADR-0007 requires "console only" to be a state you can READ off the
 * row, rather than the absence of configuration.
 */
export const NOTIFY_CHANNELS = ["console", "email", "push"];

/** Channels not built yet. Shown, but not selectable. */
export const PENDING_CHANNELS = ["push"];

export const MATRIX_SEVERITIES = ["critical", "high", "medium", "low"];

/** Full matrix with `console` forced on, mirroring the backend parser. */
export function normalizeMatrix(raw) {
  const out = {};
  for (const severity of MATRIX_SEVERITIES) {
    const entry = Array.isArray(raw?.[severity]) ? raw[severity] : [];
    const channels = entry
      .map((c) => String(c ?? "").trim().toLowerCase())
      .filter((c) => NOTIFY_CHANNELS.includes(c) && c !== "console");
    out[severity] = ["console", ...new Set(channels)];
  }
  return out;
}

/** Severities this matrix routes to a channel. */
export function severitiesFor(matrix, channel) {
  return MATRIX_SEVERITIES.filter((s) => (matrix?.[s] ?? []).includes(channel));
}

/** True when the rule targets anybody at all, by any means. */
export function hasAnyTarget(notify) {
  const len = (k) => (Array.isArray(notify?.[k]) ? notify[k].length : 0);
  return len("email") + len("members") + len("roles") > 0;
}

/** Short human summary of who a rule notifies, for the row badge. */
export function describeTargets(notify) {
  const parts = [];
  const roles = Array.isArray(notify?.roles) ? notify.roles : [];
  const members = Array.isArray(notify?.members) ? notify.members : [];
  const emails = Array.isArray(notify?.email) ? notify.email : [];
  if (roles.length) parts.push(roles.join(", "));
  if (members.length) parts.push(`${members.length} member${members.length === 1 ? "" : "s"}`);
  if (emails.length) parts.push(`${emails.length} address${emails.length === 1 ? "" : "es"}`);
  return parts.join(" · ");
}

/** Split on newlines, commas and semicolons — operators paste all three. */
export function parseRecipients(text) {
  if (typeof text !== "string") return [];
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function validateRecipients(list) {
  const entries = Array.isArray(list) ? list : [];
  const invalid = entries.filter((e) => !EMAIL_RE.test(e));
  const unique = [...new Set(entries)];
  return {
    invalid,
    unique,
    overCap: unique.length > MAX_RECIPIENTS,
    ok: invalid.length === 0 && unique.length <= MAX_RECIPIENTS,
  };
}
