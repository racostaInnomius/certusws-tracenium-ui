// src/components/Alerts/ruleGroups.js
//
// The alert rule catalog, grouped by the plugin each source belongs to.
//
// The plugin of every template and rule comes from the backend
// (`plugin` on each row, derived from ALERT_SOURCE_PLUGIN) — never from a
// list kept here. This module used to be the place where hand-kept lists
// drifted (SOURCE_LABEL, NOTIFY_ROLES); grouping must not add another.
//
// Kept apart from the component so it is testable without rendering.

export const PLATFORM_GROUP = "platform";
/** Rows without a `plugin` field at all — a backend older than the grouping. */
export const OTHER_GROUP = "other";

const groupKeyOf = (row) => {
  if (row?.plugin === undefined) return OTHER_GROUP;
  return row.plugin ?? PLATFORM_GROUP;
};

/**
 * `availability` is the backend's `pluginAvailability`: per plugin
 * `{ available, reason, tierRequired }`, or null when it could not be
 * worked out — and then nothing is locked, because not knowing is not
 * "you don't have it".
 */
export function availabilityOf(availability, key) {
  if (key === PLATFORM_GROUP || key === OTHER_GROUP) return { available: true, reason: null, tierRequired: null };
  const entry = availability && typeof availability === "object" ? availability[key] : null;
  return entry ?? { available: true, reason: null, tierRequired: null };
}

/** Why a group is locked, in words an operator can act on. */
export function describeUnavailable({ reason, tierRequired }) {
  if (reason === "not_entitled") {
    return tierRequired ? `Requires the ${capitalize(tierRequired)} plan` : "Not included in your plan";
  }
  if (reason === "disabled") return "Turned off in Agent Settings";
  return "";
}

function capitalize(s) {
  const t = String(s ?? "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * @param {{ templates: any[], rules: any[], catalog: any[], availability: object|null }} input
 * @returns {Array<{
 *   key: string, title: string, label: string|null,
 *   available: boolean, reason: string|null, tierRequired: string|null,
 *   items: Array<{ template: any, primary: any|null }>, custom: any[],
 *   total: number, enabled: number, paused: number
 * }>}
 */
export function groupRules({ templates = [], rules = [], catalog = [], availability = null }) {
  const byTemplate = new Map();
  for (const r of rules) {
    if (!r?.templateId) continue;
    if (!byTemplate.has(r.templateId)) byTemplate.set(r.templateId, []);
    byTemplate.get(r.templateId).push(r);
  }

  const groups = new Map();
  const ensure = (key) => {
    if (!groups.has(key)) groups.set(key, { key, items: [], custom: [] });
    return groups.get(key);
  };
  for (const t of templates) {
    ensure(groupKeyOf(t)).items.push({ template: t, primary: byTemplate.get(t.templateId)?.[0] ?? null });
  }
  for (const r of rules) {
    if (!r?.templateId) ensure(groupKeyOf(r)).custom.push(r);
  }

  // Platform first, then the catalog's own order, then anything unknown.
  const order = [PLATFORM_GROUP, ...catalog.map((c) => c.key), OTHER_GROUP];
  const rank = (k) => (order.includes(k) ? order.indexOf(k) : order.length);
  const entryOf = (k) => catalog.find((c) => c.key === k);

  const out = [...groups.values()].map((g) => {
    const cat = entryOf(g.key);
    const avail = availabilityOf(availability, g.key);
    const instances = [...g.items.map((i) => i.primary).filter(Boolean), ...g.custom];
    return {
      ...g,
      title:
        g.key === PLATFORM_GROUP
          ? "Platform"
          : g.key === OTHER_GROUP
            ? "Other"
            : cat?.title || g.key.toUpperCase(),
      label: cat?.label ?? (g.key === PLATFORM_GROUP || g.key === OTHER_GROUP ? null : g.key.toUpperCase()),
      available: avail.available,
      reason: avail.reason ?? null,
      tierRequired: avail.tierRequired ?? null,
      total: g.items.length + g.custom.length,
      enabled: instances.filter((r) => r.enabled).length,
      paused: instances.filter((r) => r.paused).length,
    };
  });

  // What you can use goes on top; locked groups sink, in catalog order.
  return out.sort((a, b) => (a.available === b.available ? rank(a.key) - rank(b.key) : a.available ? -1 : 1));
}
