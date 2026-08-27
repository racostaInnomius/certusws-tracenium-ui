// src/components/patch-management/buildWorklist.js
//
// Merges the two things a Patch Management operator has to act on — exposed
// CVEs and open misconfigurations — into one ordered list.
//
// The page used to open on five counters: devices reporting, total missing,
// critical/important, reboot pending, healthy. None of them answered the
// question people actually arrive with, which is "of all this, what do I do
// first?". A number with nowhere to click trains you to ignore the strip it
// lives in.
//
// The ordering is NOT invented here. It is the rule the CVE service already
// uses (cve-detection.service.ts): past-due KEV first, because CISA BOD 22-01
// put a date on it; then actively exploited at all, which outranks any CVSS
// band; then severity, then base score, then blast radius. Two sources, one
// order, so the list reads as a single queue rather than two lists stapled
// together.

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0, none: 0 };

function rankOf(severity) {
  const key = String(severity ?? "").trim().toLowerCase();
  return SEVERITY_RANK[key] ?? 0;
}

/** A CVE the fleet is exposed to. */
export function fromExposure(cve) {
  return {
    kind: "cve",
    id: cve.cveId,
    title: cve.title || cve.cveId,
    severity: cve.severity ?? "unknown",
    cvssScore: typeof cve.cvssScore === "number" ? cve.cvssScore : null,
    knownExploited: cve.knownExploited === true,
    kevOverdue: cve.kevOverdue === true,
    devicesAffected: Number(cve.affectedDeviceCount ?? 0),
    // Exposure is resolved by updating the software, not by a one-click fix
    // from this row, so it never claims to be directly fixable.
    fixable: false,
  };
}

/** An open misconfiguration, aggregated per check. */
export function fromFinding(finding) {
  return {
    kind: "finding",
    id: finding.checkId,
    title: finding.title || finding.checkId,
    // Carried so the queue can route to the surface that actually renders it:
    // `patching` findings live on the Patches tab, everything else on Security
    // configuration. Without this the button lands you on a page that does not
    // contain the row it promised.
    category: finding.category ?? null,
    severity: finding.severity ?? "unknown",
    // Config findings carry no CVSS. Left null rather than faked, so a CVE
    // with a real score outranks them at equal severity — which is the honest
    // ordering, not a scoring trick.
    cvssScore: null,
    knownExploited: false,
    kevOverdue: false,
    devicesAffected: Number(finding.devicesAffected ?? 0),
    fixable: finding.agentRemediable === true,
  };
}

/**
 * The comparator, mirroring cve-detection.service.ts.
 *
 * The one addition is the last tiebreak: among items that are otherwise
 * equally urgent, the one the agent can fix from here comes first. It never
 * outranks severity or exploitation — it only breaks a tie in favour of the
 * thing you can actually finish today.
 */
export function byPriority(a, b) {
  const overdue = Number(b.kevOverdue) - Number(a.kevOverdue);
  if (overdue !== 0) return overdue;

  const kev = Number(b.knownExploited) - Number(a.knownExploited);
  if (kev !== 0) return kev;

  const severity = rankOf(b.severity) - rankOf(a.severity);
  if (severity !== 0) return severity;

  const score = (b.cvssScore ?? 0) - (a.cvssScore ?? 0);
  if (score !== 0) return score;

  const blast = b.devicesAffected - a.devicesAffected;
  if (blast !== 0) return blast;

  return Number(b.fixable) - Number(a.fixable);
}

/**
 * Why this item is where it is, in the words an operator would use.
 *
 * A ranked list that will not explain its own order is just a different
 * arbitrary order, and the first time someone disagrees with the top row they
 * stop trusting the whole thing.
 */
export function reasonFor(item) {
  if (item.kevOverdue) return "Past its CISA remediation deadline";
  if (item.knownExploited) return "Actively exploited in the wild";

  const severity = String(item.severity ?? "").toLowerCase();
  if (severity === "critical" || severity === "high") {
    const band = severity === "critical" ? "Critical" : "High";
    return item.devicesAffected > 1
      ? `${band} severity on ${item.devicesAffected} devices`
      : `${band} severity`;
  }
  if (item.devicesAffected > 1) return `Affects ${item.devicesAffected} devices`;
  return "Open finding";
}

/**
 * @param exposures fleet CVE exposure rows
 * @param findings  aggregated open findings
 * @param limit     how many to surface; the rest stay in their own surfaces
 */
export function buildWorklist(exposures = [], findings = [], limit = 8) {
  const items = [
    ...(Array.isArray(exposures) ? exposures : []).map(fromExposure),
    ...(Array.isArray(findings) ? findings : []).map(fromFinding),
  ].filter((i) => i.id);

  items.sort(byPriority);
  return items.slice(0, Math.max(0, limit)).map((item) => ({
    ...item,
    reason: reasonFor(item),
  }));
}
