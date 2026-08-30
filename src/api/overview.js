// src/api/overview.js
//
// Thin aggregator over the existing per-domain api modules. The Overview
// page needs data from 6+ endpoints; instead of having each component
// fire its own call (and each component handling its own loading/error
// state separately), we fan out from here with Promise.allSettled and
// let the page render partial data if one backend endpoint is slow or
// broken. A failing /jobs/timeseries shouldn't blank out the whole Hero.
//
// Each helper is a single GET — no heavy client-side composition, just
// friendlier names. Individual pages (Audit, Jobs, Certs, Compliance)
// still own their own deeper views; this module only serves the Hero +
// charts + tables on the Overview.

import { httpGetJson, isTemporaryApiError } from "./http";
import { getAlertEvents, getAlertsUnreadCount } from "./alerts";
import { getDevicePosture } from "./compliance";

// ---- existing endpoints we already ship -------------------------------

export async function getDashboardSummary() {
  return httpGetJson("/api/v1/dashboard/summary");
}

export async function getHardwareRankings() {
  return httpGetJson("/api/v1/dashboard/hardware-inventory/rankings");
}

export async function getAuditSummaryForOverview() {
  return httpGetJson("/api/v1/security/audit/summary");
}

export async function getCertificatesSummary() {
  return httpGetJson("/api/v1/security/certificates/summary");
}

export async function getExpiringCertificates(days = 30) {
  return httpGetJson(`/api/v1/security/certificates/expiring?withinDays=${days}`);
}

export async function getConnectedDevices() {
  return httpGetJson("/api/v1/orchestrator/devices-connected");
}

export async function getRecentEnrollments(limit = 5) {
  // Reuses the paginated hosts list. Overview only needs the first page
  // and the backend sorts by collectedAtUtc so lifecycle-hidden devices
  // are filtered in the same place as the full Asset Management table.
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", String(limit));
  params.set("sortBy", "collectedAtUtc");
  params.set("sortDir", "desc");
  return httpGetJson(`/api/v1/dashboard/hosts?${params.toString()}`);
}

export async function getAgentVersionsSummary() {
  // Raw per-tenant counts of `device_enrollments.agent_version`.
  // Shape: { ok, total, byVersion: [{ version, count }, ...] }
  return httpGetJson("/api/v1/dashboard/agent-versions");
}

export async function getPluginCoverageSummary() {
  // Per-plugin enablement across the tenant's fleet.
  // Shape: { ok, total, byPlugin: [{ plugin: "scp", count: 3 }, ...] }
  return httpGetJson("/api/v1/dashboard/plugin-coverage");
}

export async function getPluginCoverageDevices(plugin) {
  // Drill-down: which devices are covered vs missing for a given plugin.
  // Shape: {
  //   ok, plugin, total, coveredCount, missingCount,
  //   covered: [{agentId, hostname, platform, lastSeenAt}, ...],
  //   missing: [{agentId, hostname, platform, lastSeenAt}, ...]
  // }
  const safe = encodeURIComponent(String(plugin || "").toLowerCase().trim());
  return httpGetJson(`/api/v1/dashboard/plugin-coverage/${safe}/devices`);
}

// ---- new endpoints for the Overview ----------------------------------

// Sprint 2 item 7 — these two used to be byte-identical copies of the
// helpers in api/compliance.js (same URLs, drifting doc comments).
// Imported AND re-exported: fetchOverviewBundle below uses them
// locally, and Overview components import them from this module.
import { getComplianceSummary, getFleetComplianceTimeseries } from "./compliance";
export { getComplianceSummary, getFleetComplianceTimeseries };

export async function getAuditTimeseries(windowDays = 7, lane) {
  // `lane` es opcional: Overview no lo manda y sigue viendo toda la
  // actividad, la página de Audit sí para que la gráfica enseñe lo mismo
  // que la tabla de debajo.
  const laneQs = lane ? `&lane=${encodeURIComponent(lane)}` : "";
  return httpGetJson(`/api/v1/security/audit/timeseries?window=${windowDays}d${laneQs}`);
}

export async function getJobsTimeseries(windowDays = 7) {
  return httpGetJson(`/api/v1/orchestrator/jobs/timeseries?window=${windowDays}d`);
}

// ---- agent version (for "outdated" alert logic) ----------------------

/**
 * Latest published version per platform+arch. Used to compute the
 * "agent X% outdated" Hero card.
 *
 * ONE request via the bulk endpoint. This used to fan out to four — macos and
 * windows × x64 and arm64 — inside a client switch that already fires ~28, and
 * where a 1 KB response costs a full round-trip queued behind everything else.
 *
 * The old fan-out also hard-coded its platform list, so Linux agents were never
 * compared against a published version and could never show as outdated. The
 * bulk endpoint derives the combinations server-side from the platforms it
 * actually serves, which is why that list is gone from here rather than simply
 * having "linux" appended: a hard-coded copy is what let it drift.
 *
 * Falls back to the old fan-out when the endpoint isn't there. The UI and the
 * backend deploy independently, so shipping this first must not blank the Hero
 * card — a 404 means "old backend", and we take the four requests for now.
 */
export async function getLatestAgentVersions() {
  try {
    const bulk = await httpGetJson("/api/v1/binaries/agent/metadata/all", {
      notifyOnTemporaryError: false,
    });
    if (Array.isArray(bulk?.items)) {
      return bulk.items.map((item) => ({
        platform: item.platform,
        arch: item.arch,
        data: item.data,
        ok: item.ok !== false,
      }));
    }
    // Shape we don't recognise — treat like a missing endpoint rather than
    // handing the Hero card something it will silently mis-read.
  } catch (err) {
    // A real outage must surface, exactly as it did before: the caller
    // distinguishes "no build published" from "backend down", and swallowing
    // a 5xx here would report every agent as up-to-date.
    if (isTemporaryApiError(err)) {
      throw err;
    }
    // Anything else (404 on an older backend) → fall through.
  }

  return getLatestAgentVersionsPerCombo();
}

/**
 * Pre-bulk fan-out, kept only as the fallback above. Delete once every
 * deployed backend serves /agent/metadata/all.
 */
async function getLatestAgentVersionsPerCombo() {
  const platforms = ["macos", "windows"];
  const arches = ["arm64", "x64"];

  const calls = platforms.flatMap((platform) =>
    arches.map((arch) =>
      httpGetJson(
        `/api/v1/binaries/agent/metadata?platform=${platform}&arch=${arch}`
      )
        .then((data) => ({ platform, arch, data, ok: true }))
        .catch((err) => {
          // A missing combination (e.g. no x64 macOS build yet) is a
          // benign 404 — degrade to an empty slot so the caller just
          // skips it. But a REAL server error (500/503, network,
          // timeout — anything the http layer flags as temporary/5xx)
          // must NOT be swallowed: rethrowing lets the caller / UI /
          // telemetry distinguish "no build published" from "backend
          // down". Previously both looked identical (silent { ok:false }).
          if (isTemporaryApiError(err)) {
            throw err;
          }
          return { platform, arch, ok: false };
        })
    )
  );

  return Promise.all(calls);
}

// ---- bundled fetch for the whole Overview in one call tree -----------

/**
 * Fan out all the reads the Overview needs, in parallel, with
 * allSettled so one slow/broken endpoint doesn't stall the rest. The
 * component owns the shape decoding and decides what to render on each
 * slot; this helper just returns the raw results keyed by name.
 *
 * Usage:
 *   const { results } = await fetchOverviewBundle();
 *   results.dashboardSummary.status === 'fulfilled' ? results.dashboardSummary.value : null
 */
export async function fetchOverviewBundle() {
  const entries = [
    ["dashboardSummary", getDashboardSummary()],
    ["hardwareRankings", getHardwareRankings()],
    ["auditSummary", getAuditSummaryForOverview()],
    ["certsSummary", getCertificatesSummary()],
    ["expiringCerts", getExpiringCertificates(30)],
    ["complianceSummary", getComplianceSummary()],
    ["auditTimeseries", getAuditTimeseries(7)],
    ["jobsTimeseries", getJobsTimeseries(7)],
    ["latestVersions", getLatestAgentVersions()],
    ["recentHosts", getRecentEnrollments(5)],
    // connectedDevices is the authoritative source for "online now"
    // in the Hero KPI. /dashboard/summary exposes totals but NOT the
    // session-based online count, so we call the orchestrator's
    // derived view (device_sessions.last_heartbeat within threshold).
    ["connectedDevices", getConnectedDevices()],
    // Agent version histogram — /dashboard/hosts does not expose
    // agent_version or arch, so we need a dedicated aggregate off
    // device_enrollments to power the Fleet composition donut and the
    // AttentionPanel's "agents behind latest" count.
    ["agentVersions", getAgentVersionsSummary()],
    // Top N most recent alerts across all the rules the tenant has
    // enabled. Drives the "Latest alerts" strip on the Overview.
    // Limit 5 is deliberate — the strip is a bell-replacement, not the
    // full feed; operators click through to /alerts for the full view.
    ["alertEvents", getAlertEvents({ limit: 5 }).catch(() => ({ items: [] }))],
    // Unread count (events since the tenant's last_seen_at cursor) —
    // backs the "Unread alerts" Hero KPI. Kept as its own tiny call
    // instead of computing from alertEvents because the backend has a
    // dedicated handler that already knows how to compare against the
    // cursor, and it's the same endpoint the Topbar bell polls.
    ["alertsUnread", getAlertsUnreadCount().catch(() => ({ count: 0 }))],
    // Device posture per host — we only need the `patchSummary` sub-
    // object on each row, but the endpoint returns it alongside the
    // rest of the compliance columns. Cheap on small fleets; the
    // Patch coverage donut aggregates client-side so we don't pay a
    // second backend hit just for the counts.
    ["devicePosture", getDevicePosture().catch(() => ({ items: [] }))],
    // Per-plugin enablement across the fleet. Drives the new Plugin
    // coverage strip on the Overview — answers "of N total agents,
    // how many have SCP / PMP / AMP on".
    ["pluginCoverage", getPluginCoverageSummary().catch(() => ({ total: 0, byPlugin: [] }))],
    // Fleet-wide compliance trend — drives the Compliance Trend
    // sparkline card on the Overview. 30-day window: matches the
    // dashboard "trend" period operators care about for posture, and
    // stays under the snapshot retention floor (90d).
    ["fleetComplianceTimeseries",
     getFleetComplianceTimeseries(30).catch(() => ({ windowDays: 30, buckets: [] }))]
  ];

  const settled = await Promise.allSettled(entries.map(([, p]) => p));
  const results = Object.fromEntries(
    entries.map(([key], idx) => [key, settled[idx]])
  );

  return { results };
}
