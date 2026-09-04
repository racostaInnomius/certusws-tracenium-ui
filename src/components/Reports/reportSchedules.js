// src/components/Reports/reportSchedules.js
//
// Pure helpers for the schedules panel (ADR-0014 E3). Kept out of the
// components so react-refresh stays happy and the tests need no DOM.

export const PERIOD_OPTIONS = [
  { value: 1, label: "Previous month" },
  { value: 3, label: "Previous 3 months" },
  { value: 6, label: "Previous 6 months" },
  { value: 12, label: "Previous 12 months" },
];

export function describePeriod(months) {
  const n = Number(months) || 1;
  const hit = PERIOD_OPTIONS.find((o) => o.value === n);
  return hit ? hit.label : `Previous ${n} months`;
}

/** Whether a report type needs a period at all (declares a month param). */
export function typeHasPeriod(type) {
  return Boolean((type?.params || []).some((p) => p.kind === "month"));
}

/** Non-month params of a type, for the dialog and the summary. */
export function scheduleParamDefs(type) {
  return (type?.params || []).filter((p) => p.kind !== "month");
}

/** "SOC 2 · All devices" style summary of a schedule's stored params. */
export function summarizeParams(schedule, type, { frameworks = [], groups = [] } = {}) {
  const parts = [];
  const params = schedule?.params || {};
  for (const p of scheduleParamDefs(type)) {
    const v = params[p.name];
    if (p.kind === "framework") {
      const fw = frameworks.find((f) => f.framework === v);
      parts.push(fw?.shortName || v || "—");
    } else if (p.kind === "asset_group") {
      const g = groups.find((x) => String(x.id) === String(v));
      parts.push(v ? g?.name || `Group ${v}` : "All devices");
    } else if (v !== undefined && v !== null && v !== "") {
      parts.push(String(v));
    }
  }
  return parts.join(" · ");
}

export function recipientCount(schedule) {
  return (schedule?.recipientMemberIds?.length || 0) + (schedule?.recipientExternal?.length || 0);
}

const STATUS_LABELS = {
  ok: "Generated",
  sent: "Sent",
  not_sent: "Not sent",
  failed: "Failed",
  skipped_not_entitled: "Skipped (plugin not enabled)",
};

export function runStatusLabel(status) {
  if (!status) return "—";
  return STATUS_LABELS[status] || status;
}

export function runStatusColor(status) {
  if (status === "ok" || status === "sent") return "success";
  if (status === "not_sent" || status === "skipped_not_entitled") return "warning";
  if (status === "failed") return "error";
  return "default";
}

const TRIGGER_LABELS = { manual: "Download", email: "Email", schedule: "Scheduled" };

export function triggerLabel(trigger) {
  return TRIGGER_LABELS[trigger] || trigger || "—";
}

export function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
