// src/components/patch-management/patchCatalog.js
//
// ADR-0038 F3 (D7) — how the fleet patch catalog reads. Pure.

export const APPROVAL_META = {
  approved: { label: "Approved", tone: "positive", hint: "Cleared to install." },
  rejected: { label: "Rejected", tone: "muted", hint: "Not going to be installed. Outside the remediation clock." },
  deferred: { label: "Deferred", tone: "caution", hint: "Not before its date. Outside the remediation clock until then." },
  blocked: { label: "Blocked", tone: "critical", hint: "Never sent — by no button and no policy." },
};

export function approvalMeta(approval) {
  return APPROVAL_META[approval] ?? { label: "Not reviewed", tone: "neutral", hint: "No decision yet." };
}

const DAY = 86_400_000;

/** "12 days" / "≥ 12 days" when the date predates the catalog. */
export function pendingSinceText(item, now = Date.now()) {
  if (!item?.oldestPendingSince) return "—";
  const days = Math.max(0, Math.floor((now - Date.parse(item.oldestPendingSince)) / DAY));
  const n = days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`;
  return item.oldestPendingBackfilled ? `≥ ${n}` : n;
}

/** The commitment line: "Critical 7 d · Important 30 d · …" (MSRC names). */
export function targetsText(targets) {
  if (!targets) return "";
  const rows = [
    ["Critical", targets.critical],
    ["Important", targets.high],
    ["Moderate", targets.medium],
    ["Low", targets.low],
  ].filter(([, d]) => d != null);
  return rows.map(([l, d]) => `${l} ${d} d`).join(" · ");
}

/** "92 % · 3 install attempts on 3 devices" — or why there is no score. */
export function confidenceText(c) {
  if (!c) return { label: "—", hint: "No install outcome recorded for this patch yet." };
  const pct = Math.round((c.score ?? 0) * 100);
  return {
    label: `${pct}%`,
    hint: `Install success across the Tracenium fleet: ${c.devices} device(s), ${c.attempts} attempt(s), ${c.failedAttempts} failed${c.uninstalls ? `, ${c.uninstalls} uninstalled` : ""}. Evidence: ${c.evidence}.`,
  };
}

export function matchesFilter(item, { text = "", approval = "all" } = {}) {
  if (approval === "unreviewed" ? item.approval != null : approval !== "all" && item.approval !== approval) return false;
  const q = text.trim().toLowerCase();
  if (!q) return true;
  return `${item.patchId} ${item.title ?? ""}`.toLowerCase().includes(q);
}

/** Decision form → PATCH body, or { error }. */
export function decisionPayload(form, now = new Date()) {
  const body = {};
  const approval = form.approval === "none" ? null : form.approval;
  body.approval = approval;
  const reason = String(form.reason ?? "").trim();
  if ((approval === "blocked" || approval === "rejected") && !reason) {
    return { error: "Say why — it shows wherever this patch appears and goes to the audit log." };
  }
  if (approval) body.reason = reason || null;
  if (approval === "deferred") {
    const d = new Date(`${form.deferredUntil}T00:00:00Z`);
    if (!form.deferredUntil || Number.isNaN(d.getTime()) || d <= now) return { error: "Pick a date in the future." };
    body.deferredUntil = d.toISOString();
  }
  body.knownIssue = String(form.knownIssue ?? "").trim() || null;
  const sup = String(form.supersededBy ?? "").trim();
  if (sup && !/^[A-Za-z0-9][A-Za-z0-9 ._:+~(),-]{0,199}$/.test(sup)) return { error: "“Superseded by” must be a patch id, e.g. KB5129237." };
  body.supersededBy = sup || null;
  return { body };
}
