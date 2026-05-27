// src/constants/plugins.js
//
// Canonical plugin catalog shared by every UI surface that needs to
// know about plugins:
//   - PluginControl page (toggle on/off per tenant)
//   - Policies page (display "configure intervals" panels gated by
//     the corresponding plugin being enabled)
//   - PluginCoverageStrip (drill-down labels)
//
// Until the backend exposes a /plugins/catalog endpoint (Phase 2), this
// is the single source of truth in the frontend. Adding a new plugin
// means editing exactly this file plus the backend allowlist (see the
// follow-up plan note in PluginControl.jsx).
//
// Shape:
//   key          — short id used in the policy JSON (`plugins.enabled[]`)
//                  and on the wire to the agent
//   label        — short uppercase identifier for chips/badges
//   title        — human-readable name for cards/lists
//   description  — one-liner shown next to the toggle
//   required     — true → plugin ships with the agent core, can't be
//                  turned off; the toggle renders locked-on
//   impliesModule — when this plugin is enabled, the named module is
//                  derived as enabled in `modules.{name}` (e.g. SCP
//                  implies the compliance module). Used by both pages
//                  and by formToPolicy() to keep modules in sync.

export const PLUGIN_CATALOG = [
  {
    key: "amp",
    label: "AMP",
    title: "Asset Management",
    description:
      "Hardware and software inventory. Integrated into the agent core — always on.",
    required: true,
  },
  {
    key: "scp",
    label: "SCP",
    title: "Security Compliance",
    description:
      "Compliance facts feeding the Security Compliance page. Enabling it activates compliance collection automatically.",
    impliesModule: "compliance",
  },
  {
    key: "pmp",
    label: "PMP",
    title: "Patch Management",
    description: "Patch scan and install. Opt-in: disabled by default.",
    impliesModule: "patch",
  },
  {
    key: "sdp",
    label: "SDP",
    title: "Software Delivery",
    description: "Software deployment and distribution tracking.",
  },
  {
    key: "rcp",
    label: "RCP",
    title: "Remote Control",
    description:
      "Interactive remote sessions (shell / files / screen) over WebRTC. Per-capability gates live in Policies → Features. Requires agent 1.1.20+.",
    impliesModule: "remoteControl",
  },
];

/**
 * Read the enabled plugin set from a raw policy JSON, applying the
 * "required" rule (e.g. AMP is always considered enabled even if the
 * stored policy somehow omitted it).
 *
 * Returns a plain Set<string> for fast membership checks; callers that
 * need an array can spread it.
 */
export function getEnabledPluginSet(policyJson) {
  const stored = Array.isArray(policyJson?.plugins?.enabled)
    ? policyJson.plugins.enabled.map((k) => String(k).toLowerCase())
    : [];
  const required = PLUGIN_CATALOG.filter((p) => p.required).map((p) => p.key);
  return new Set([...required, ...stored]);
}

/**
 * Derive `modules` dict from a list/set of enabled plugin keys.
 * `modules.{name} = true` for every plugin with `impliesModule = name`
 * that is currently enabled.
 */
export function deriveModules(enabledPluginsIterable) {
  const enabled = new Set(
    Array.isArray(enabledPluginsIterable)
      ? enabledPluginsIterable
      : [...(enabledPluginsIterable || [])]
  );
  const modules = {};
  for (const p of PLUGIN_CATALOG) {
    if (p.impliesModule && enabled.has(p.key)) {
      modules[p.impliesModule] = true;
    }
  }
  return modules;
}
