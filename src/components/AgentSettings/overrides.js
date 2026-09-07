// src/components/AgentSettings/overrides.js
//
// The rows of the Overrides view: one per batch (scope Group / list) and
// one per device whose patch carries paths of its own (not from a batch).
// Pure, so the view and the tests read the same list.

import { SECTIONS, sectionForPath } from "./sections";
import { flattenPolicy } from "./policyDiff";

const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label]));

function sectionsOf(paths) {
  const out = [];
  for (const p of paths || []) {
    const id = sectionForPath(p);
    const label = SECTION_LABEL[id] || id;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

function fieldCount(json) {
  let n = 0;
  for (const path of flattenPolicy(json ?? {}).keys()) {
    if (path === "plugins.enabled" || path.startsWith("modules.")) continue;
    n += 1;
  }
  return n;
}

export function overrideRowsOf({ rows, batches, deviceMap }) {
  const out = [];
  for (const b of Array.isArray(batches) ? batches : []) {
    const live = Number(b.live_device_count ?? 0);
    out.push({
      id: `batch:${b.id}`,
      kind: "batch",
      batch: b,
      scope: b.group_id != null ? "group" : "list",
      name: b.group_name || "Device list",
      count: live,
      sections: [SECTION_LABEL[b.domain] || b.domain],
      fields: fieldCount(b.patch_json),
      applied: { ok: live, total: Number(b.device_count ?? live) || live, sync: b.sync_membership === true },
      by: b.applied_by || "system",
      at: b.applied_at,
      json: b.patch_json,
    });
  }
  for (const r of Array.isArray(rows) ? rows : []) {
    // Paths that came from a batch are the batch's row; what is left is the device's own.
    const own = (r.overridden_paths || []).filter((p) => !r.provenance?.[sectionForPath(p)]);
    if (own.length === 0) continue;
    const ownJson = {};
    for (const [k, v] of Object.entries(r.policy_json || {})) {
      const keep = own.some((p) => p === k || p.startsWith(`${k}.`));
      if (keep) ownJson[k] = v;
    }
    const inSync = r.last_ack_status === 0 && r.last_ack_policy_version && r.last_ack_policy_version === r.desired_policy_version;
    out.push({
      id: `device:${r.device_id}`,
      kind: "device",
      row: r,
      scope: "device",
      name: deviceMap?.get(r.device_id)?.hostname || r.csr_common_name || r.device_id,
      deviceId: r.device_id,
      connected: r.is_connected === true,
      lastSeen: r.last_seen_at,
      sections: sectionsOf(own),
      fields: own.reduce((n, p) => n + Math.max(1, [...flattenPolicy(ownJson).keys()].filter((k) => k === p || k.startsWith(`${p}.`)).length), 0),
      applied: { inSync, connected: r.is_connected === true, lastSeen: r.last_seen_at, ack: r.last_ack_status },
      by: "—",
      at: r.updated_at,
      json: ownJson,
    });
  }
  return out;
}

