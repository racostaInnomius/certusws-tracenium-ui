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

import { httpGetJson } from "./http";

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
  // Reuses the hosts list — the dashboard/hosts endpoint already sorts
  // by last enrollment/session timestamps. Overview only needs a head.
  return httpGetJson(`/api/v1/dashboard/hosts?limit=${limit}&page=0`);
}

export async function getAgentVersionsSummary() {
  // Raw per-tenant counts of `device_enrollments.agent_version`.
  // Shape: { ok, total, byVersion: [{ version, count }, ...] }
  return httpGetJson("/api/v1/dashboard/agent-versions");
}

// ---- new endpoints for the Overview ----------------------------------

export async function getComplianceSummary() {
  return httpGetJson("/api/v1/security/compliance/summary");
}

export async function getAuditTimeseries(windowDays = 7) {
  return httpGetJson(`/api/v1/security/audit/timeseries?window=${windowDays}d`);
}

export async function getJobsTimeseries(windowDays = 7) {
  return httpGetJson(`/api/v1/orchestrator/jobs/timeseries?window=${windowDays}d`);
}

// ---- agent version (for "outdated" alert logic) ----------------------

/**
 * Latest published version per platform+arch. Used to compute the
 * "agent X% outdated" Hero card. We ask for each platform separately
 * because the metadata endpoint requires it — the backend doesn't (yet)
 * expose a bulk variant.
 */
export async function getLatestAgentVersions() {
  const platforms = ["macos", "windows"];
  const arches = ["arm64", "x64"];

  const calls = platforms.flatMap((platform) =>
    arches.map((arch) =>
      httpGetJson(
        `/api/v1/binaries/agent/metadata?platform=${platform}&arch=${arch}`
      )
        .then((data) => ({ platform, arch, data, ok: true }))
        // One missing combination (e.g. no x64 macOS build yet) isn't
        // fatal — we just skip it in the caller.
        .catch(() => ({ platform, arch, ok: false }))
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
    ["agentVersions", getAgentVersionsSummary()]
  ];

  const settled = await Promise.allSettled(entries.map(([, p]) => p));
  const results = Object.fromEntries(
    entries.map(([key], idx) => [key, settled[idx]])
  );

  return { results };
}
