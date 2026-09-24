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
 * The built-in roles every tenant has. Only a FALLBACK now (ADR-0025 F3):
 * the roles a rule can target come from the tenant's TenantRoleDef via
 * GET /alerts/notify-roles, custom ones included — this list used to be
 * the whole menu, which is how `IT Support` could not be targeted.
 *
 * Targeting a role is the recommended path, and not for convenience:
 * the address is read from TenantMember at send time, so someone who
 * leaves the tenant stops being notified without anyone editing the
 * rule. A typed-in address keeps arriving until a human remembers it.
 */
export const SYSTEM_ROLES = ["OWNER", "ADMIN", "USER"];

/**
 * The role chips to show: the tenant's roles, plus any role the rule or
 * profile already targets that no longer exists — flagged `missing`, so
 * it can be removed on purpose instead of vanishing from the screen while
 * still sitting in the saved config. Matching is case-insensitive, like
 * the backend's.
 *
 * `options` is `[{ name, isSystem, reachable }]` or null (not loaded /
 * not allowed), in which case the built-in roles are offered.
 */
export function roleChoices(options, selected = []) {
  const base = Array.isArray(options)
    ? options.map((o) => ({ name: o.name, reachable: o.reachable ?? null, missing: false }))
    : SYSTEM_ROLES.map((name) => ({ name, reachable: null, missing: false }));
  const known = new Set(base.map((c) => c.name.toUpperCase()));
  const gone = (Array.isArray(selected) ? selected : [])
    .filter((r) => typeof r === "string" && r && !known.has(r.toUpperCase()))
    .map((name) => ({ name, reachable: null, missing: Array.isArray(options) }));
  return [...base, ...gone];
}

/** Case-insensitive membership, so "it support" and "IT Support" are one chip. */
export function hasRole(list, name) {
  const key = String(name).toUpperCase();
  return (Array.isArray(list) ? list : []).some((r) => String(r).toUpperCase() === key);
}

export function toggleRole(list, name) {
  const current = Array.isArray(list) ? list : [];
  return hasRole(current, name)
    ? current.filter((r) => String(r).toUpperCase() !== String(name).toUpperCase())
    : [...current, name];
}

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

const list = (v) => (Array.isArray(v) ? v : []);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Same shape as the backend's UUID check. A malformed id is dropped by the
 * backend parser, so it must not count as a target here either — otherwise
 * the badge says "configured" about a rule that notifies nobody.
 */
const PROFILE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function profileIdsOf(notify) {
  return list(notify?.profiles).filter((p) => typeof p === "string" && PROFILE_ID_RE.test(p.trim()));
}

/** True when the rule targets anybody at all, by any means. */
export function hasAnyTarget(notify) {
  return (
    list(notify?.email).length +
      list(notify?.members).length +
      list(notify?.roles).length +
      profileIdsOf(notify).length >
    0
  );
}

/**
 * Short human summary of who a rule notifies, for the row badge.
 *
 * `profileNames` is a Map id → name. A profile id that is not in it is
 * counted as "missing" rather than skipped: a rule whose profile was
 * deleted must not read as if it still notified that audience.
 */
export function describeTargets(notify, profileNames = null) {
  const parts = [];
  const ids = profileIdsOf(notify);
  if (ids.length) {
    if (profileNames instanceof Map) {
      const named = ids.map((id) => profileNames.get(id.toLowerCase())).filter(Boolean);
      const missing = ids.length - named.length;
      if (named.length) parts.push(named.join(", "));
      if (missing) parts.push(plural(missing, "missing profile", "missing profiles"));
    } else {
      parts.push(plural(ids.length, "profile", "profiles"));
    }
  }
  const roles = list(notify?.roles);
  const members = list(notify?.members);
  const emails = list(notify?.email);
  if (roles.length) parts.push(roles.join(", "));
  if (members.length) parts.push(plural(members.length, "member", "members"));
  if (emails.length) parts.push(plural(emails.length, "address", "addresses"));
  return parts.join(" · ");
}

/** Who a profile targets, for its row in the Profiles tab. */
export function describeProfileTargets(profile) {
  return describeTargets({ roles: profile?.roles, members: profile?.members, email: profile?.email });
}

/**
 * The PATCH body for a rule's delivery, from the editor's state.
 *
 * ⚠️ `members` is carried over from the saved rule untouched. The editor
 * has no control for it, and before this function existed saving from the
 * UI rebuilt the object from email + roles only — so a rule targeting
 * people by `members` (set through the API) lost them on the next save,
 * silently. Profiles would have gone the same way.
 */
export function buildNotifyPayload({ current, emails, roles, profiles, matrix, minSeverity }) {
  const payload = {};
  if (emails?.length) payload.email = emails;
  if (roles?.length) payload.roles = roles;
  const members = list(current?.members);
  if (members.length) payload.members = members;
  if (profiles?.length) payload.profiles = profiles;
  // No targets at all is the documented way to turn delivery off: `{}`.
  if (Object.keys(payload).length === 0) return {};
  // The matrix is saved whenever there are targets: that is what makes
  // "console only" a state you can read on the row.
  return { ...payload, channels: matrix, minSeverity: minSeverity ?? "low" };
}

/**
 * El desajuste entre a QUIÉN se avisa y POR DÓNDE, que es invisible mirando
 * cualquiera de los dos controles por separado.
 *
 * ⚠️ El caso que motiva esto: la matriz por defecto de 10 de las 23 fuentes
 * es «sólo consola» (higiene ruidosa, ADR-0007 gate 3). Añadir destinatarios
 * a una de ellas parece configurarla y no envía nada — en producción, 15 de
 * 16 reglas encendidas estaban así de calladas.
 *
 * @returns {{ tone: "warning", text: string }|null}
 */
export function describeDeliveryGap({ targetCount, mailSeverities }) {
  const targets = Number(targetCount) || 0;
  const severities = Array.isArray(mailSeverities) ? mailSeverities.length : 0;
  if (targets > 0 && severities === 0) {
    return {
      tone: "warning",
      text:
        `These ${plural(targets, "recipient gets", "recipients get")} nothing: no severity is routed to email. ` +
        "Turn Email on for at least one severity above.",
    };
  }
  if (targets === 0 && severities > 0) {
    return {
      tone: "warning",
      text: "Email is on for some severities, but nobody is listed — add a profile, a role or an address.",
    };
  }
  return null;
}

/**
 * One line for "who does this reach today", from a /recipients response.
 * `tone` drives the colour: a rule that reaches nobody, or lost people to
 * the cap, must not look like a healthy one.
 */
export function summarizeRecipients(res) {
  if (!res || res.configured === false) {
    return { tone: "muted", text: "Console only — nobody is emailed." };
  }
  const to = list(res.to);
  const notes = [];
  const missing = list(res.missingProfiles).length;
  if (missing) notes.push(`${plural(missing, "profile no longer exists", "profiles no longer exist")}`);
  if (res.truncated > 0) {
    notes.push(`${plural(res.truncated, "recipient", "recipients")} left out by the ${MAX_RECIPIENTS}-recipient cap`);
  }
  if (to.length === 0) {
    return {
      tone: "error",
      text: ["Reaches nobody today — no active member with an email matches.", ...notes].join(" "),
    };
  }
  const base = `Reaches ${plural(to.length, "address", "addresses")} today: ${to.join(", ")}.`;
  return { tone: notes.length ? "warning" : "ok", text: notes.length ? `${base} ⚠ ${notes.join("; ")}.` : base };
}

/**
 * Human message for a rejected profile or delivery write. The backend
 * names what is wrong (the address, the role, the rules still using a
 * profile) — surfacing that is the difference between "fix this address"
 * and a generic "save failed" the operator cannot act on.
 */
export function describeNotifyError(err, fallback = "Could not save") {
  const body = err?.body ?? {};
  const code = String(body.error || err?.code || "").toUpperCase();
  const names = (xs) => list(xs).slice(0, 3).join(", ") + (list(xs).length > 3 ? "…" : "");
  switch (code) {
    case "INVALID_EMAILS":
      return `Not a valid address: ${names(body.invalid)}`;
    case "UNKNOWN_ROLES":
    case "UNKNOWN_NOTIFY_ROLES":
      return `No such role in this tenant: ${names(body.unknown)}. It may have been renamed or removed — reload and pick again.`;
    case "UNKNOWN_MEMBERS":
      return `Not a member of this tenant: ${names(body.unknown)}`;
    case "PROFILE_EMPTY":
      return "A profile has to notify someone — add a role, a member or an address.";
    case "TOO_MANY_RECIPIENTS":
      return `Too many recipients — at most ${body.max ?? MAX_RECIPIENTS} addresses and ${body.max ?? MAX_RECIPIENTS} members.`;
    case "NAME_REQUIRED":
      return "The profile needs a name.";
    case "NAME_TOO_LONG":
      return `Name too long — at most ${body.max ?? 80} characters.`;
    case "PROFILE_NAME_TAKEN":
      return "There is already a profile with that name.";
    case "PROFILE_LIMIT_REACHED":
      return "This tenant has reached the maximum number of profiles.";
    case "PROFILE_IN_USE": {
      const rules = list(body.rules).map((r) => r?.name).filter(Boolean);
      return `Still used by ${plural(rules.length, "rule", "rules")}: ${names(rules)}. Remove it from those rules first.`;
    }
    case "PROFILE_NOT_FOUND":
      return "That profile no longer exists.";
    case "UNKNOWN_NOTIFY_PROFILES":
      return "One of the selected profiles no longer exists — reload and pick again.";
    case "INVALID_NOTIFY_RECIPIENTS":
      return "Check the recipients — one of them is not valid.";
    default:
      return fallback;
  }
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
