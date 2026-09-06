// src/components/AgentSettings/plugins.js
//
// One row per catalog plugin for the read-only Plugins view: active in this
// policy?, in the plan?, minimum tier, where its settings live, and how
// many devices actually advertise it.

import { SECTIONS } from "./sections";

export function pluginRows({ catalog = [], form = null, entitled = null, coverage = null }) {
  const toggles = form?.plugins && typeof form.plugins === "object" ? form.plugins : {};
  const byPlugin = Array.isArray(coverage?.byPlugin) ? coverage.byPlugin : [];
  const total = Number(coverage?.total ?? 0);
  return (Array.isArray(catalog) ? catalog : []).map((p) => {
    const active = p.required === true || toggles[p.key] === true;
    const inPlan = entitled ? entitled.has(String(p.key).toLowerCase()) : null;
    const found = byPlugin.find((r) => String(r?.plugin || "").toLowerCase() === String(p.key).toLowerCase());
    const count = found ? Number(found.count ?? 0) : null;
    let status;
    if (active && inPlan === false) status = "active_not_in_plan";
    else if (active) status = "active";
    else if (inPlan === false) status = "not_in_plan";
    else status = "included_inactive";
    return {
      key: p.key,
      label: p.label,
      title: p.title,
      description: p.description,
      required: p.required === true,
      tier: p.tier_required ?? p.tierRequired ?? null,
      hasSection: SECTIONS.some((s) => s.plugin === p.key),
      status,
      coverageCount: count,
      coverageTotal: total,
    };
  });
}
