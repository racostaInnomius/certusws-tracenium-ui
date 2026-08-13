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
