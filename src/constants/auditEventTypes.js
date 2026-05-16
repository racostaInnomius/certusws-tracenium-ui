// src/constants/auditEventTypes.js
//
// Catalog of every `event_type` value the backend writes to the
// `security_events` table, grouped into categories with display
// metadata for the Audit page.
//
// Why a frontend-side catalog instead of just "let the backend send
// what it sends":
//
//   * The raw values are SCREAMING_SNAKE / snake_case mixed
//     (POLICY_TENANT_PLUGINS_CHANGED vs cert_revoked) and not
//     designed for human reading. We pretty-print them here so the
//     dropdown / DataGrid don't shout in the operator's face.
//
//   * We want to GROUP them in the filter dropdown (Policies, PKI,
//     gRPC, Facts) so picking a filter is a one-step glance rather
//     than scanning a 25-item flat list.
//
//   * Color-coded chips in the table cell give immediate "what KIND
//     of event is this row?" without parsing the prefix.
//
// The catalog is intentionally permissive: any event_type not listed
// here falls through to a generic "Other" bucket with a neutral
// appearance. New event types added on the backend show up
// automatically (since the facets endpoint is dynamic) — they just
// look generic until someone adds a row here.

import { BRAND } from "../theme/brand";

// Each entry maps an EXACT event_type string to display metadata.
// Keep the list alphabetized within each category for readability.
const EVENT_TYPE_CATALOG = {
  // ── Policies (Phase 2.B audit) ───────────────────────────────────
  POLICY_TENANT_CREATED:           { label: "Tenant policy created",           category: "Policies" },
  POLICY_TENANT_UPDATED:           { label: "Tenant policy updated",           category: "Policies" },
  POLICY_TENANT_PLUGINS_CHANGED:   { label: "Tenant: plugins changed",         category: "Policies" },
  POLICY_TENANT_CONFIG_CHANGED:    { label: "Tenant: config changed",          category: "Policies" },
  POLICY_TENANT_PUSHED:            { label: "Tenant policy pushed",            category: "Policies" },
  POLICY_DEVICE_CREATED:           { label: "Device override created",         category: "Policies" },
  POLICY_DEVICE_UPDATED:           { label: "Device override updated",         category: "Policies" },
  POLICY_DEVICE_PLUGINS_CHANGED:   { label: "Device: plugins changed",         category: "Policies" },
  POLICY_DEVICE_CONFIG_CHANGED:    { label: "Device: config changed",          category: "Policies" },
  POLICY_DEVICE_DELETED:           { label: "Device override removed",         category: "Policies" },
  POLICY_DEVICE_PUSHED:            { label: "Device policy pushed",            category: "Policies" },
  // Legacy lowercase variants from earlier instrumentation. Same
  // category so they group with the SCREAMING_SNAKE Phase 2.B types.
  // Heads-up: `policy_ack_ok` is the highest-volume event in the
  // table by far (one row per device per policy push), so keeping
  // the label compact ("Policy applied") prevents it from blowing
  // out the dropdown layout.
  policy_hello_drift_detected:     { label: "Policy drift on HELLO",           category: "Policies" },
  policy_ack_ok:                   { label: "Policy applied",                  category: "Policies" },
  policy_ack_failed:               { label: "Policy ack failed",               category: "Policies" },

  // ── PKI / certificates ───────────────────────────────────────────
  cert_revoked:           { label: "Certificate revoked",          category: "PKI" },
  cert_renew_requested:   { label: "Cert renew requested",         category: "PKI" },
  cert_renew_issued:      { label: "Cert renew issued",            category: "PKI" },
  cert_renew_activated:   { label: "Cert renew activated",         category: "PKI" },
  cert_expired:           { label: "Certificate expired",          category: "PKI" },

  // ── gRPC stream lifecycle ────────────────────────────────────────
  grpc_connect:               { label: "gRPC connected",               category: "gRPC" },
  grpc_disconnect:            { label: "gRPC disconnected",            category: "gRPC" },
  grpc_stream_error:          { label: "gRPC stream error",            category: "gRPC" },
  grpc_revoked_disconnect:    { label: "gRPC disconnect (revoked)",    category: "gRPC" },

  // ── Facts ingestion ──────────────────────────────────────────────
  facts_scp_rejected:     { label: "SCP facts rejected",           category: "Facts" },
};

// Per-category appearance — single source of truth for chip color
// and dropdown header tint. Adding a new category means adding one
// row here and the rest is picked up automatically.
const CATEGORY_META = {
  Policies: { color: BRAND.teal,           tint: BRAND.tealSoft  },
  PKI:      { color: BRAND.alert.warning,  tint: BRAND.alert.warningSoft },
  gRPC:     { color: BRAND.cyan || BRAND.teal, tint: BRAND.cyanSoft || BRAND.tealSoft },
  Facts:    { color: BRAND.alert.error,    tint: BRAND.alert.errorSoft },
  Other:    { color: BRAND.gray,           tint: BRAND.darkSoft  },
};

// Stable display order for category groupings in the dropdown.
// Policies first because Phase 2.B added many policy events and ops
// people are most likely to look for them right now. Other goes
// last so unclassified rows land at the bottom.
export const CATEGORY_ORDER = ["Policies", "PKI", "gRPC", "Facts", "Other"];

/**
 * Look up display metadata for a raw event_type string.
 * Always returns an object — falls back to the "Other" category with
 * a humanized version of the raw key.
 */
export function getEventTypeMeta(eventType) {
  if (!eventType) {
    return {
      raw: "",
      label: "(unknown)",
      category: "Other",
      ...CATEGORY_META.Other,
    };
  }
  const entry = EVENT_TYPE_CATALOG[eventType];
  if (entry) {
    return {
      raw: eventType,
      label: entry.label,
      category: entry.category,
      ...(CATEGORY_META[entry.category] || CATEGORY_META.Other),
    };
  }
  // Unknown — humanize the raw token best-effort: split on _ then
  // title-case the first word, keep the rest lowercase. Beats showing
  // "FOOBAR_BAZ_QUX" verbatim to operators.
  const humanized = String(eventType)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
  return {
    raw: eventType,
    label: humanized,
    category: "Other",
    ...CATEGORY_META.Other,
  };
}

/**
 * Group an array of facet rows ({value, count}) by category, applying
 * the catalog's display order. Used to populate the Event Type
 * dropdown in the Audit page filter.
 *
 * Returns: [{ category, color, tint, items: [{value, count, label}] }]
 *
 * Items within a group keep the count-desc order the backend already
 * imposed.
 */
export function groupFacetsByCategory(facets) {
  if (!Array.isArray(facets) || facets.length === 0) return [];

  const buckets = new Map();
  for (const item of facets) {
    const meta = getEventTypeMeta(item.value);
    if (!buckets.has(meta.category)) {
      buckets.set(meta.category, {
        category: meta.category,
        color: meta.color,
        tint: meta.tint,
        items: [],
      });
    }
    buckets.get(meta.category).items.push({
      value: item.value,
      count: item.count,
      label: meta.label,
    });
  }

  // Apply CATEGORY_ORDER, then any remaining categories alphabetically.
  const ordered = [];
  for (const cat of CATEGORY_ORDER) {
    if (buckets.has(cat)) {
      ordered.push(buckets.get(cat));
      buckets.delete(cat);
    }
  }
  for (const cat of [...buckets.keys()].sort()) {
    ordered.push(buckets.get(cat));
  }
  return ordered;
}
