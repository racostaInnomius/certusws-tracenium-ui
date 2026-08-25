// src/utils/jobInsights.js
//
// Derivations behind the Jobs page's top band: triage counts, failure causes
// and repeat-offender devices.
//
// Lives outside the page for the same reason jobBatches / jobResult / jobForm
// do: Jobs.jsx is 2400 lines and nothing inside it can be tested.

const IN_FLIGHT = ["pending", "sent", "running", "retrying"];
const FAILED = ["failed", "timeout"];

const lower = (v) => String(v || "").toLowerCase();
const ms = (v) => {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * Collapse a raw `last_error` into a cause you can group by.
 *
 * The strings are free-form and carry per-job detail, so grouping them raw
 * gives a list where every row has count 1 — useless. These rules were written
 * against the 14 distinct values actually present in production, not invented:
 *
 *   `software_install:failed;deploymentId=10;reason=install_failed`
 *       → the cause is what `reason=` says, not the prefix. Cutting at the
 *         first `;` would yield "software_install:failed", which is the job
 *         type restating that it failed.
 *   `update_failed: connect ETIMEDOUT 20.60.178.4:443`
 *       → the address varies per attempt, so leaving it in scatters one cause
 *         across as many rows as there are endpoints.
 *   `patch_install partial; installed=0; failed=0; rebootRequired=false`
 *       → everything after the first `;` is a per-run counter.
 *   `stale_after_5_failed_attempts`
 *       → the attempt count varies; the cause does not.
 *
 * Anything that doesn't match a rule is returned trimmed, never dropped: an
 * unrecognised error must still show up in the list, or the panel quietly
 * under-reports what is breaking.
 */
export function normalizeFailureCause(raw) {
  let text = String(raw ?? "").trim();
  if (!text) return null;

  // `reason=` wins when present — it is the most specific thing in the string.
  const reason = text.match(/reason=([^;]+)/i);
  if (reason) {
    text = reason[1].trim();
  } else {
    const semi = text.indexOf(";");
    if (semi > 0) text = text.slice(0, semi).trim();
  }

  // Drop volatile detail: addresses, ports, and the numbers embedded in
  // generated messages. Done AFTER the cut so a `reason=` value is cleaned too
  // (`install_failed: exe installer requires ex…` keeps its shape).
  text = text
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/g, "")
    // No \b here: underscore is a word character, so "_5_" has no boundary
    // and `stale_after_5_failed_attempts` failed to group with the 2-attempt
    // one — the exact case this rule exists for.
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .replace(/[\s:;,-]+$/, "")
    .trim();

  return text || null;
}

/**
 * The four numbers the band leads with.
 *
 * `stuck` is the one that does not exist anywhere else in the UI: a job that
 * is still pending or retrying, has NEVER been sent (`sent_at` null), and has
 * been waiting longer than a day. It is how the two jobs that sat on a dead
 * endpoint for 46 hours would have surfaced without anyone querying the
 * database.
 */
export function deriveTriage(jobs, { now = Date.now(), windowHours = 24 } = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const since = now - windowHours * 3600 * 1000;
  const recent = (j) => {
    const t = ms(j.completed_at) ?? ms(j.updated_at) ?? ms(j.created_at);
    return t !== null && t >= since;
  };

  const failed = list.filter((j) => lower(j.status) === "failed" && recent(j)).length;
  const timedOut = list.filter((j) => lower(j.status) === "timeout" && recent(j)).length;

  const stuck = list.filter((j) => {
    if (!["pending", "retrying"].includes(lower(j.status))) return false;
    if (j.sent_at) return false;
    const created = ms(j.created_at);
    return created !== null && now - created > 24 * 3600 * 1000;
  }).length;

  // Success rate over everything that reached a terminal state. Jobs still in
  // flight are excluded rather than counted as failures — a rate that drops
  // because work is in progress would be worse than no rate at all.
  const terminal = list.filter((j) => !IN_FLIGHT.includes(lower(j.status)));
  const completed = terminal.filter((j) => lower(j.status) === "completed").length;
  const successRate = terminal.length
    ? Math.round((completed / terminal.length) * 100)
    : null;

  return { failed, timedOut, stuck, successRate, completed, terminal: terminal.length };
}

/** Failure causes, most frequent first. */
export function groupFailureCauses(jobs, { limit = 5 } = {}) {
  const counts = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (!FAILED.includes(lower(job.status))) continue;
    const cause = normalizeFailureCause(job.last_error) || "unreported";
    counts.set(cause, (counts.get(cause) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause))
    .slice(0, limit);
}

/**
 * Devices whose jobs keep failing, worst first.
 *
 * The angle that found the real problem in production: one endpoint holding 11
 * failed jobs, invisible in a list sorted by time because its rows were spread
 * across two days.
 */
export function groupFailingDevices(jobs, { deviceMap = null, limit = 5 } = {}) {
  const byDevice = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (!FAILED.includes(lower(job.status))) continue;
    const id = String(job.device_id || "");
    if (!id) continue;
    const entry = byDevice.get(id) || { deviceId: id, count: 0, lastAt: null };
    entry.count += 1;
    const t = ms(job.created_at);
    if (t !== null && (entry.lastAt === null || t > entry.lastAt)) entry.lastAt = t;
    byDevice.set(id, entry);
  }

  return [...byDevice.values()]
    .map((entry) => ({
      ...entry,
      // Falls back to the id, like the history table — a device the roster
      // does not know still has to be nameable enough to click.
      hostname: deviceMap?.get(entry.deviceId)?.hostname || entry.deviceId,
    }))
    .sort((a, b) => b.count - a.count || (b.lastAt ?? 0) - (a.lastAt ?? 0))
    .slice(0, limit);
}
