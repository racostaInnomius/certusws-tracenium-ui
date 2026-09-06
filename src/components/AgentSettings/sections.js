// src/components/AgentSettings/sections.js
//
// The navigation model of Agent Settings: one section per plugin, plus the
// agent's own settings, the read-only plan view and the raw editor. Pure,
// so the nav, the "changes per section" badges and the tests share one
// definition instead of three lists that drift.
//
// Sections are keyed by the plugin key the backend catalog uses (amp, scp,
// pmp, sdp, cdp, rcp) so enabling/disabling follows the catalog, not a
// hardcoded list here.

export const SECTIONS = [
  {
    id: "plugins",
    label: "Plugins",
    kind: "plan",
    description:
      "What your subscription includes. Activation follows the plan; it is not switched here.",
  },
  {
    id: "agent",
    label: "Agent",
    kind: "core",
    description: "Self-update cadence, endpoint widgets and location reporting.",
  },
  {
    id: "amp",
    label: "Asset Management",
    plugin: "amp",
    description: "How often the agent collects hardware and software inventory.",
  },
  {
    id: "scp",
    label: "Security Compliance",
    plugin: "scp",
    description: "Compliance evaluation cadence. Remediation baselines live in Security Compliance.",
    related: { label: "Open Security Compliance", page: "security-baselines" },
  },
  {
    id: "pmp",
    label: "Patch Management",
    plugin: "pmp",
    description: "Patch scan cadence. Maintenance windows and gateways live in Patch Management.",
    related: { label: "Open Patch Management", page: "patch" },
  },
  {
    id: "sdp",
    label: "Software Delivery",
    plugin: "sdp",
    description: "Per-device download limits. Distribution points live in Software Delivery.",
    related: { label: "Open Software Delivery", page: "software-delivery" },
  },
  {
    id: "cdp",
    label: "Crypto Discovery",
    plugin: "cdp",
    description: "Scan cadence, keystores, certificate directories and TLS probing.",
    related: { label: "Open Crypto Discovery", page: "cdp" },
  },
  {
    id: "rcp",
    label: "Remote Control",
    plugin: "rcp",
    description: "Which remote capabilities agents advertise, consent and recording. Access approval lives in Remote Control.",
    related: { label: "Open Remote Control", page: "remote-control" },
  },
  {
    id: "ai",
    label: "AI",
    kind: "core",
    description: "AI-assisted explanations and their daily quotas.",
  },
  {
    id: "advanced",
    label: "Advanced",
    kind: "advanced",
    description: "The raw policy document. Replaces everything, including blocks edited on other pages.",
  },
];

export const TOOL_VIEWS = [
  { id: "overrides", label: "Overrides", description: "Devices running a policy of their own." },
  { id: "rollout", label: "Policy rollout", description: "Which version each device acknowledged." },
];

export const DEFAULT_SECTION = "agent";

export const ALL_VIEW_IDS = [...SECTIONS.map((s) => s.id), ...TOOL_VIEWS.map((t) => t.id)];

/**
 * Nav entries for the current tenant: a plugin section is `enabled` when the
 * plugin is on in the loaded policy (the form's read-only toggle map) or
 * required by the catalog; core sections always are. Disabled sections are
 * still listed, dimmed, so the operator learns the plugin exists.
 */
export function buildSections(catalog = [], form = null) {
  const byKey = new Map((Array.isArray(catalog) ? catalog : []).map((p) => [p.key, p]));
  const toggles = form?.plugins && typeof form.plugins === "object" ? form.plugins : {};
  return SECTIONS.map((section) => {
    if (!section.plugin) return { ...section, enabled: true };
    const entry = byKey.get(section.plugin);
    const enabled = entry?.required === true || toggles[section.plugin] === true;
    return { ...section, enabled, catalogEntry: entry || null };
  });
}

// Which section a policy path belongs to — used to badge the nav with the
// number of unsaved changes per section.
const PATH_RULES = [
  [/^plugins(\.|$)/, "plugins"],
  [/^modules(\.|$)/, "plugins"],
  [/^inventory(\.|$)/, "amp"],
  [/^compliance(\.|$)/, "scp"],
  [/^patch(\.|$)/, "pmp"],
  [/^update(\.|$)/, "agent"],
  [/^features\.remote/, "rcp"],
  [/^rcp(\.|$)/, "rcp"],
  [/^remoteControl(\.|$)/, "rcp"],
  [/^features(\.|$)/, "agent"],
  [/^ai(\.|$)/, "ai"],
  [/^sdp(\.|$)/, "sdp"],
  [/^cdp(\.|$)/, "cdp"],
];

export function sectionForPath(path) {
  for (const [re, id] of PATH_RULES) if (re.test(path)) return id;
  return "advanced";
}

/** { sectionId: count } from a diff entry list (see policyDiff.js). */
export function changesBySection(diffEntries) {
  const out = {};
  for (const e of Array.isArray(diffEntries) ? diffEntries : []) {
    const id = sectionForPath(e.path);
    out[id] = (out[id] || 0) + 1;
  }
  return out;
}

export function isKnownView(id) {
  return ALL_VIEW_IDS.includes(id);
}
