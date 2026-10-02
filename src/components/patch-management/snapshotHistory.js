// src/components/patch-management/snapshotHistory.js
//
// ADR-0038 D10 — how each snapshot in the history reads. Pure.
//
// A live snapshot reads exactly as it does in the decision list above it: its
// `live` field is the same RollbackPoint, so its state comes from stateMeta and
// nothing here second-guesses retention. Only finished snapshots get their
// wording here.

import { RELEASE_REASONS, humanDuration, stateMeta } from "./rollbackPoints";

export const HISTORY_FILTERS = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "removed", label: "Removed" },
  { value: "failed", label: "Not taken" },
  { value: "reverted", label: "Reverted" },
  { value: "merged", label: "Shared" },
];

/** Count shown next to a filter; `all` is the sum of the stages (reverted overlaps them). */
export function filterCount(counts, value) {
  if (!counts) return null;
  if (value === "all") return ["requested", "live", "removed", "failed", "merged"].reduce((n, k) => n + (counts[k] ?? 0), 0);
  if (value === "live") return (counts.live ?? 0) + (counts.requested ?? 0);
  return counts[value] ?? 0;
}

const GATEWAY_REASONS = {
  not_correlated: "This device's VM was not found in vCenter.",
  timed_out: "The gateway did not answer in time.",
  datastore_low_free_ratio: "Not enough free space on the datastore.",
};

export function failureText(entry) {
  const r = entry?.failureReason;
  const base = GATEWAY_REASONS[r] ?? (r ? String(r).replace(/_/g, " ") : "The snapshot was not taken.");
  return entry?.failureDetail ? `${base} ${entry.failureDetail}` : base;
}

function person(subject, email) {
  return email || subject || "someone";
}

const reasonLabel = (v) => RELEASE_REASONS.find((r) => r.value === v)?.label ?? v;

/**
 * { label, tone, detail } for one history row.
 * tone: critical | caution | info | neutral | muted (same palette as the decision list).
 */
export function historyStatus(entry) {
  switch (entry?.stage) {
    case "live": {
      if (entry.live) {
        const m = stateMeta(entry.live.state);
        return { label: m.label, tone: m.tone, detail: m.hint || "" };
      }
      return { label: "Kept", tone: "info", detail: "" };
    }
    case "requested":
      return { label: "Requested", tone: "info", detail: "Waiting for the gateway to take it." };
    case "removed":
      if (entry.removedBy === "operator") {
        const why = entry.releaseReason ? ` — ${reasonLabel(entry.releaseReason)}` : "";
        const note = entry.releaseNote ? `: “${entry.releaseNote}”` : "";
        return { label: "Released", tone: "neutral", detail: `Released by ${person(entry.releasedBy, entry.releasedByEmail)}${why}${note}` };
      }
      return { label: "Removed automatically", tone: "muted", detail: "Its retention period ended." };
    case "failed":
      return { label: "Not taken", tone: "critical", detail: failureText(entry) };
    case "merged":
      return {
        label: "Shared",
        tone: "muted",
        detail: entry.mergedIntoId ? `A retry reused snapshot #${entry.mergedIntoId}.` : "A retry reused an earlier snapshot.",
      };
    default:
      return { label: String(entry?.stage || "Unknown"), tone: "neutral", detail: "" };
  }
}

/** What the change it protected looked like afterwards (ADR-0038 F1). */
export function verificationSummary(jobs = []) {
  const v = jobs.map((j) => j.verification).filter(Boolean);
  if (v.includes("failed")) return { label: "Not healthy after the patch", tone: "critical" };
  if (v.includes("dispatched")) return { label: "Checking…", tone: "info" };
  if (v.includes("passed")) return { label: "Checked healthy", tone: "neutral" };
  if (v.includes("timeout") || v.includes("error")) return { label: "Check did not finish", tone: "caution" };
  if (v.includes("no_baseline")) return { label: "Not compared (no before)", tone: "muted" };
  if (v.includes("not_needed")) return { label: "Nothing installed", tone: "muted" };
  if (v.includes("unsupported")) return { label: "Agent too old to check", tone: "muted" };
  return null;
}

/** "Patch run", "2 patch runs", "Software deployment #12". */
export function protectsText(entry) {
  if (entry?.deploymentId != null && entry.purpose !== "patch") return `Software deployment #${entry.deploymentId}`;
  const n = (entry?.jobs ?? []).length;
  return n > 1 ? `${n} patch runs` : "Patch run";
}

/** How long it existed: taken → removed, or taken → now while it lives. */
export function lifetimeText(entry, now = Date.now()) {
  const start = Date.parse(entry?.requestedAt ?? "");
  if (!Number.isFinite(start) || entry?.stage === "failed" || entry?.stage === "merged") return "—";
  const end = entry.removedAt ? Date.parse(entry.removedAt) : now;
  const d = humanDuration(end - start);
  return entry.removedAt ? d : `${d} so far`;
}
