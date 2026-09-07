// src/components/AgentSettings/rolloutModel.js
//
// Pure model behind the "Policy rollout" view. Turns the rows of
// GET /policies/tenants/:id/policy-status into buckets an operator can act
// on, and groups the fleet by the policy version each agent actually
// acknowledged.
//
// Two lessons from production (2026-09-06) shape the rules here:
//
//   1. The old summary counted every row. The devices that looked "behind"
//      in every tenant were agents 1.1.2 / 1.1.13 / 1.1.29, disconnected for
//      months. A rollout number that includes retired hardware is not a
//      rollout number. Rows that are disconnected AND unseen for longer
//      than STALE_DAYS are EXCLUDED from the denominator and shown apart.
//
//   2. The effective version is `<base>[-o…][-e…][-r…][-gw…]`: the base changes
//      when someone edits the tenant policy; `-o` marks a device override
//      patch (phase B); the `-r` suffix changes when the registry-probe
//      catalog changes (four times between 03 and 05-sep); `-gw` marks the
//      gateway role. Grouping the fleet by the full string
//      makes a catalog change look like a botched rollout. The version is
//      parsed so the view can say WHICH part moved.

export const STALE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Split an effective policy version into its parts. Unknown suffixes are
 * kept in `extra` so a future suffix never makes the parser lie.
 *
 *   parsePolicyVersion("1788476532943-rf2129992-gwf334de3c")
 *   → { raw, base: "1788476532943", probes: "f2129992", gateway: "f334de3c",
 *       entitlements: null, extra: [] }
 */
export function parsePolicyVersion(value) {
  const raw = value === null || value === undefined ? "" : String(value).trim();
  if (!raw) return { raw: "", base: "", override: null, probes: null, gateway: null, entitlements: null, extra: [] };
  const [base, ...suffixes] = raw.split("-");
  const out = { raw, base, override: null, probes: null, gateway: null, entitlements: null, extra: [] };
  for (const s of suffixes) {
    if (/^r[0-9a-f]{8}$/i.test(s)) out.probes = s.slice(1);
    else if (/^gw([0-9a-f]{8}|0)$/i.test(s)) out.gateway = s.slice(2);
    else if (/^e[0-9a-f]{8}$/i.test(s)) out.entitlements = s.slice(1);
    else if (/^o[0-9a-f]{8}$/i.test(s)) out.override = s.slice(1);
    else out.extra.push(s);
  }
  return out;
}

/**
 * Short label for a version relative to the tenant's current base: when
 * the base matches, only the suffixes are shown (that is what changed);
 * otherwise the base is shown so an operator sees "older policy".
 */
export function versionLabel(value, currentBase) {
  const p = parsePolicyVersion(value);
  if (!p.raw) return "(none)";
  const suffix =
    (p.override ? `-o${p.override}` : "") +
    (p.entitlements ? `-e${p.entitlements}` : "") +
    (p.probes ? `-r${p.probes}` : "") +
    (p.gateway ? `-gw${p.gateway}` : "") +
    (p.extra.length ? `-${p.extra.join("-")}` : "");
  if (currentBase && p.base === currentBase) return suffix ? `…${suffix}` : "…";
  return p.raw;
}

function lastSeenMs(row) {
  // `last_seen_at` (device_enrollments) is the real last contact; the
  // session heartbeat gets overwritten by sweeps. Both are considered.
  const candidates = [row?.last_seen_at, row?.last_heartbeat, row?.last_ack_at, row?.last_sent_at];
  let best = null;
  for (const c of candidates) {
    if (!c) continue;
    const t = Date.parse(c);
    if (Number.isFinite(t) && (best === null || t > best)) best = t;
  }
  return best;
}

/**
 * One of: in_sync · pending · error · offline · excluded.
 *
 *   excluded  disconnected and not seen for STALE_DAYS (or never seen).
 *             Retired-looking hardware; out of the denominator.
 *   error     the agent answered the last push with a non-zero status.
 *   in_sync   the acknowledged version equals the desired one.
 *   offline   disconnected but recently seen: it will converge on reconnect.
 *   pending   connected, desired differs from acknowledged (or never acked).
 */
export function classifyRolloutRow(row, { now = Date.now(), staleDays = STALE_DAYS } = {}) {
  const connected = row?.is_connected === true;
  const seen = lastSeenMs(row);
  const ageMs = seen === null ? Infinity : now - seen;
  if (!connected && ageMs > staleDays * DAY_MS) return "excluded";

  const ackStatus = row?.last_ack_status;
  if (ackStatus !== null && ackStatus !== undefined && ackStatus !== 0) return "error";

  const desired = row?.desired_policy_version || null;
  const acked = row?.last_ack_policy_version || null;
  if (desired && acked && desired === acked && ackStatus === 0) return "in_sync";
  if (!connected) return "offline";
  return "pending";
}

/**
 * Aggregate for the KPI tiles and the two charts. `byVersion` covers ACTIVE
 * rows only (excluded ones are not part of the story) and is sorted by
 * count. `currentBase` is the most common desired base among active rows —
 * what the tenant policy is today — so labels can shorten to the suffix.
 */
export function summarizeRollout(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = { total: list.length, active: 0, inSync: 0, pending: 0, offline: 0, error: 0, excluded: 0 };
  const buckets = new Map();
  const desiredBases = new Map();

  for (const row of list) {
    const bucket = classifyRolloutRow(row, opts);
    buckets.set(row, bucket);
    if (bucket === "excluded") { counts.excluded += 1; continue; }
    counts.active += 1;
    if (bucket === "in_sync") counts.inSync += 1;
    else if (bucket === "pending") counts.pending += 1;
    else if (bucket === "offline") counts.offline += 1;
    else if (bucket === "error") counts.error += 1;
    const base = parsePolicyVersion(row?.desired_policy_version).base;
    if (base) desiredBases.set(base, (desiredBases.get(base) || 0) + 1);
  }

  let currentBase = "";
  let best = -1;
  for (const [base, n] of desiredBases) {
    if (n > best) { best = n; currentBase = base; }
  }

  const versions = new Map();
  for (const row of list) {
    if (buckets.get(row) === "excluded") continue;
    const acked = row?.last_ack_policy_version || "";
    const key = acked || "(none)";
    const entry = versions.get(key) || {
      version: acked,
      label: versionLabel(acked, currentBase),
      count: 0,
      current: 0,
      ...parsePolicyVersion(acked),
    };
    entry.count += 1;
    if (acked && acked === row?.desired_policy_version) entry.current += 1;
    versions.set(key, entry);
  }

  const byVersion = [...versions.values()]
    .map((v) => ({ ...v, isCurrent: v.count > 0 && v.current === v.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { ...counts, currentBase, byVersion, bucketOf: (row) => buckets.get(row) || classifyRolloutRow(row, opts) };
}

export const BUCKET_LABEL = {
  in_sync: "Up to date",
  pending: "Pending",
  offline: "Offline",
  error: "Error",
  excluded: "Excluded",
};

/**
 * Convergence after the last tenant change: how many ACTIVE devices were on
 * their desired version at each moment since `since` (the tenant policy's
 * updated_at). Points are the ACK instants of in-sync devices, cumulative,
 * plus a first point at `since` (0) and a last one at `now`. Catalog
 * reversions (`desired_change_reason === "catalog_rollout"`) after `since`
 * come out as `markers`, so the chart can say "this dip was the catalog".
 *
 * A device acknowledged before `since` while still in sync (clock skew, or
 * a device that never needed the new base) counts from `since`.
 */
export function convergenceSeries(rows, { since, now = Date.now(), staleDays = STALE_DAYS } = {}) {
  const start = since ? Date.parse(since) : NaN;
  const list = Array.isArray(rows) ? rows : [];
  if (!Number.isFinite(start)) return { points: [], markers: [], active: 0, inSync: 0, since: null };
  const active = list.filter((r) => classifyRolloutRow(r, { now, staleDays }) !== "excluded");
  const acks = [];
  const markerSet = new Map();
  for (const row of active) {
    const bucket = classifyRolloutRow(row, { now, staleDays });
    if (bucket === "in_sync") {
      const t = Date.parse(row?.last_ack_at);
      acks.push(Number.isFinite(t) && t > start ? t : start);
    }
    if (row?.desired_change_reason === "catalog_rollout") {
      const t = Date.parse(row?.desired_changed_at);
      if (Number.isFinite(t) && t > start) {
        const key = Math.floor(t / 60000); // one marker per minute, not per device
        markerSet.set(key, key * 60000);
      }
    }
  }
  acks.sort((a, b) => a - b);
  const points = [{ t: start, inSync: 0 }];
  let n = 0;
  for (const t of acks) {
    n += 1;
    points.push({ t, inSync: n });
  }
  const end = Math.max(now, start);
  if (points[points.length - 1].t !== end) points.push({ t: end, inSync: n });
  return { points, markers: [...markerSet.values()].sort((a, b) => a - b), active: active.length, inSync: n, since: start };
}
