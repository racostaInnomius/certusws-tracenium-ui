// src/components/patch-management/patchPolicies.js
//
// ADR-0038 F4 — how a patch policy and its runs read, and the editor form ↔ API
// body. Pure.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SEVERITY_LABEL = { critical: "Critical", important: "Important", moderate: "Moderate", low: "Low", unknown: "Unrated" };

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "Patch Tuesday + 2 days, 22:00 America/Chicago" */
export function cadenceText(c) {
  if (!c) return "—";
  const at = `${hhmm(c.atMinute ?? 0)} ${c.timezone ?? ""}`.trim();
  if (c.kind === "weekly") return `Every ${WEEKDAYS[c.weekday ?? 0]}, ${at}`;
  if (c.kind === "monthly") return `Monthly on the ${ordinal(c.dayOfMonth ?? 1)}, ${at}`;
  const off = c.offsetDays ?? 0;
  return `Patch Tuesday${off ? ` + ${off} day${off === 1 ? "" : "s"}` : ""}, ${at}`;
}

export function severitiesText(list = []) {
  return list.map((s) => SEVERITY_LABEL[s] ?? s).join(", ");
}

/** Where a run stands, in one line. */
export function runSummary(run) {
  if (!run) return { label: "Not run yet", tone: "muted" };
  const ring = run.rings?.[run.currentRing];
  if (run.status === "halted") return { label: `Halted at ${ring?.name ?? "a ring"}`, tone: "critical", detail: run.haltedReason };
  if (run.status === "cancelled") return { label: "Cancelled", tone: "muted" };
  if (run.status === "completed") {
    return run.patchIds?.length ? { label: `Completed · ${run.patchIds.length} patch(es)`, tone: "positive" } : { label: "Nothing to install", tone: "muted", detail: run.haltedReason };
  }
  return { label: `${ring?.name ?? "Ring"} (${(run.currentRing ?? 0) + 1} of ${run.rings?.length ?? 1})`, tone: "info", detail: ring?.reason ?? null };
}

/** One ring of a run: "3 devices · 3 green" / "waiting: soaking". */
export function ringText(r) {
  if (!r?.dispatchedAt) return `${r?.devices ?? 0} device(s) · not started`;
  const st = r.stats;
  const parts = [`${r.devices} device(s)`, `${r.jobsCreated ?? 0} job(s)`];
  if (st) {
    if (st.green) parts.push(`${st.green} checked healthy`);
    if (st.failed) parts.push(`${st.failed} failed`);
    if (st.unverified) parts.push(`${st.unverified} unverified`);
    if (st.pending) parts.push(`${st.pending} in progress`);
  }
  return parts.join(" · ");
}

export function emptyPolicyForm() {
  return {
    name: "",
    enabled: true,
    scopeAssetGroupId: "",
    platforms: [],
    severities: ["critical", "important"],
    requireApproval: false,
    cadence: { kind: "patch_tuesday", offsetDays: 2, weekday: 6, dayOfMonth: 1, atTime: "22:00", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
    rebootIfRequired: false,
    windowMode: "window",
    deadlineDays: "",
    deadlineIgnoresWindow: false,
    promoteThresholdPct: 80,
    promoteMinDevices: 3,
    rings: [
      { name: "Pilot", assetGroupId: "", soakHours: 24 },
      { name: "Everyone else", assetGroupId: "", soakHours: 0 },
    ],
  };
}

export function policyToForm(p) {
  const c = p.cadence ?? {};
  return {
    ...emptyPolicyForm(),
    name: p.name,
    enabled: p.enabled,
    scopeAssetGroupId: p.scopeAssetGroupId == null ? "" : String(p.scopeAssetGroupId),
    platforms: p.platforms ?? [],
    severities: p.severities ?? [],
    requireApproval: p.requireApproval,
    cadence: { kind: c.kind, offsetDays: c.offsetDays ?? 0, weekday: c.weekday ?? 6, dayOfMonth: c.dayOfMonth ?? 1, atTime: hhmm(c.atMinute ?? 0), timezone: c.timezone },
    rebootIfRequired: p.rebootIfRequired,
    windowMode: p.windowMode ?? "window",
    deadlineDays: p.deadlineDays == null ? "" : String(p.deadlineDays),
    deadlineIgnoresWindow: p.deadlineIgnoresWindow,
    promoteThresholdPct: p.promoteThresholdPct,
    promoteMinDevices: p.promoteMinDevices,
    rings: (p.rings ?? []).map((r) => ({ name: r.name, assetGroupId: r.assetGroupId == null ? "" : String(r.assetGroupId), soakHours: r.soakHours })),
  };
}

/** Editor form → API body, or { error }. The backend validates again. */
export function policyPayload(f) {
  const name = String(f.name ?? "").trim();
  if (!name) return { error: "Give the policy a name." };
  if (!f.severities?.length) return { error: "Pick at least one severity." };
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(f.cadence?.atTime ?? ""));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { error: "Pick the time it runs." };
  if (!f.rings?.length) return { error: "Add at least one ring." };
  for (const [i, r] of f.rings.entries()) {
    if (r.assetGroupId === "" && i !== f.rings.length - 1) return { error: `Ring ${i + 1} needs a group: only the last ring can be “everyone else”.` };
  }
  const deadlineDays = f.deadlineDays === "" || f.deadlineDays == null ? null : Number(f.deadlineDays);
  if (deadlineDays != null && (!Number.isInteger(deadlineDays) || deadlineDays < 1 || deadlineDays > 90)) return { error: "The deadline is 1 to 90 days." };
  const c = f.cadence;
  return {
    body: {
      name,
      enabled: f.enabled !== false,
      scopeAssetGroupId: f.scopeAssetGroupId === "" ? null : Number(f.scopeAssetGroupId),
      platforms: f.platforms?.length ? f.platforms : null,
      severities: f.severities,
      requireApproval: f.requireApproval === true,
      cadence: {
        kind: c.kind,
        atMinute: Number(m[1]) * 60 + Number(m[2]),
        timezone: c.timezone,
        ...(c.kind === "patch_tuesday" ? { offsetDays: Number(c.offsetDays) || 0 } : {}),
        ...(c.kind === "weekly" ? { weekday: Number(c.weekday) } : {}),
        ...(c.kind === "monthly" ? { dayOfMonth: Number(c.dayOfMonth) } : {}),
      },
      rebootIfRequired: f.rebootIfRequired === true,
      windowMode: f.windowMode === "on_connect" ? "on_connect" : "window",
      deadlineDays,
      deadlineIgnoresWindow: deadlineDays != null && f.deadlineIgnoresWindow === true,
      promoteThresholdPct: Number(f.promoteThresholdPct) || 80,
      promoteMinDevices: Number(f.promoteMinDevices) || 3,
      rings: f.rings.map((r, i) => ({
        name: String(r.name ?? "").trim() || `Ring ${i + 1}`,
        assetGroupId: r.assetGroupId === "" ? null : Number(r.assetGroupId),
        soakHours: Number(r.soakHours) || 0,
      })),
    },
  };
}
