import { describe, it, expect } from "vitest";
import {
  classifyRolloutRow,
  convergenceSeries,
  parsePolicyVersion,
  summarizeRollout,
  versionLabel,
  STALE_DAYS,
} from "./rolloutModel";

const NOW = Date.parse("2026-09-06T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetMs) => new Date(NOW - offsetMs).toISOString();

describe("parsePolicyVersion", () => {
  it("splits base, probe suffix and gateway suffix", () => {
    const p = parsePolicyVersion("1788476532943-rf2129992-gwf334de3c");
    expect(p).toMatchObject({ base: "1788476532943", probes: "f2129992", gateway: "f334de3c", entitlements: null, extra: [] });
  });
  it("keeps the entitlement suffix and unknown suffixes apart", () => {
    const p = parsePolicyVersion("1788273862888-e0a1b2c3d4-r3ced0d41-zz9");
    expect(p.entitlements).toBeNull(); // 9 hex chars is not the 8-char contract → extra
    expect(p.probes).toBe("3ced0d41");
    expect(p.extra).toEqual(["e0a1b2c3d4", "zz9"]);
    expect(parsePolicyVersion("1788273862888-e0a1b2c3d").entitlements).toBe("0a1b2c3d");
  });
  it("reads the override suffix of phase B and keeps it in the label", () => {
    const p = parsePolicyVersion("1788476532943-oa68724db-rf2129992");
    expect(p).toMatchObject({ base: "1788476532943", override: "a68724db", probes: "f2129992", extra: [] });
    expect(versionLabel("1788476532943-oa68724db-rf2129992", "1788476532943")).toBe("…-oa68724db-rf2129992");
  });
  it("tolerates empty input", () => {
    expect(parsePolicyVersion(null).raw).toBe("");
    expect(parsePolicyVersion("").base).toBe("");
  });
});

describe("versionLabel", () => {
  it("shortens to the suffix when the base is the current one", () => {
    expect(versionLabel("1788476532943-rf2129992", "1788476532943")).toBe("…-rf2129992");
    expect(versionLabel("1788476532943", "1788476532943")).toBe("…");
  });
  it("keeps the full string for another base, and (none) for empty", () => {
    expect(versionLabel("1788273862888-r79ddcd28", "1788476532943")).toBe("1788273862888-r79ddcd28");
    expect(versionLabel("", "1788476532943")).toBe("(none)");
  });
});

describe("classifyRolloutRow", () => {
  const base = { desired_policy_version: "v2-rAAAAAAAA", last_ack_policy_version: "v2-rAAAAAAAA", last_ack_status: 0 };

  it("in_sync when desired equals acknowledged with status 0", () => {
    expect(classifyRolloutRow({ ...base, is_connected: true }, { now: NOW })).toBe("in_sync");
  });

  it("pending when connected and the acknowledged version is behind", () => {
    const row = { ...base, is_connected: true, last_ack_policy_version: "v1-rAAAAAAAA" };
    expect(classifyRolloutRow(row, { now: NOW })).toBe("pending");
  });

  it("error when the agent rejected the policy, even if connected", () => {
    const row = { ...base, is_connected: true, last_ack_status: 2 };
    expect(classifyRolloutRow(row, { now: NOW })).toBe("error");
  });

  it("offline when disconnected but seen recently: it converges on reconnect", () => {
    const row = { ...base, is_connected: false, last_ack_policy_version: "v1", last_heartbeat: iso(3 * DAY) };
    expect(classifyRolloutRow(row, { now: NOW })).toBe("offline");
  });

  it("excluded when disconnected and unseen for longer than the stale window", () => {
    // The production case: agents 1.1.2 / 1.1.13 / 1.1.29, gone for months,
    // were counted as "behind" and dragged every tenant's number down.
    const row = { ...base, is_connected: false, last_ack_policy_version: "v0", last_heartbeat: iso((STALE_DAYS + 1) * DAY) };
    expect(classifyRolloutRow(row, { now: NOW })).toBe("excluded");
  });

  it("excluded when never seen at all", () => {
    const row = { desired_policy_version: "v2", is_connected: false };
    expect(classifyRolloutRow(row, { now: NOW })).toBe("excluded");
  });

  it("a connected device is never excluded, whatever its timestamps say", () => {
    const row = { desired_policy_version: "v2", is_connected: true };
    expect(classifyRolloutRow(row, { now: NOW })).toBe("pending");
  });

  it("trusts last_seen_at from enrollments over a stale session heartbeat", () => {
    const row = { ...base, is_connected: false, last_ack_policy_version: "v1", last_heartbeat: iso(90 * DAY), last_seen_at: iso(1 * DAY) };
    expect(classifyRolloutRow(row, { now: NOW })).toBe("offline");
  });

  it("uses the freshest of heartbeat, ack and sent timestamps", () => {
    const row = { ...base, is_connected: false, last_ack_policy_version: "v1", last_heartbeat: iso(60 * DAY), last_ack_at: iso(2 * DAY) };
    expect(classifyRolloutRow(row, { now: NOW })).toBe("offline");
  });
});

describe("summarizeRollout", () => {
  const rows = [
    { device_id: "a", is_connected: true, desired_policy_version: "1788476532943-rf2129992", last_ack_policy_version: "1788476532943-rf2129992", last_ack_status: 0 },
    { device_id: "b", is_connected: true, desired_policy_version: "1788476532943-rf2129992", last_ack_policy_version: "1788476532943-rf2129992", last_ack_status: 0 },
    { device_id: "c", is_connected: true, desired_policy_version: "1788476532943-rf2129992", last_ack_policy_version: "1788476532943-r79ddcd28", last_ack_status: 0 },
    { device_id: "d", is_connected: false, desired_policy_version: "1788476532943-rf2129992", last_ack_policy_version: "1788476532943-r61856f63", last_ack_status: 0, last_heartbeat: iso(2 * DAY) },
    { device_id: "e", is_connected: false, desired_policy_version: "1779932841866", last_ack_policy_version: "1777038061490", last_ack_status: 0, last_heartbeat: iso(120 * DAY) },
    { device_id: "f", is_connected: true, desired_policy_version: "1788476532943-rf2129992", last_ack_policy_version: "1788476532943-rf2129992", last_ack_status: 2 },
  ];

  it("counts buckets over the active fleet and keeps excluded apart", () => {
    const s = summarizeRollout(rows, { now: NOW });
    expect(s).toMatchObject({ total: 6, active: 5, inSync: 2, pending: 1, offline: 1, error: 1, excluded: 1 });
  });

  it("finds the current base and labels versions relative to it", () => {
    const s = summarizeRollout(rows, { now: NOW });
    expect(s.currentBase).toBe("1788476532943");
    const labels = s.byVersion.map((v) => v.label);
    // ties on count break alphabetically so the order is stable across renders
    expect(labels).toEqual(["…-rf2129992", "…-r61856f63", "…-r79ddcd28"]);
  });

  it("marks a version group as current only when every device in it is on its desired version", () => {
    const s = summarizeRollout(rows, { now: NOW });
    const current = s.byVersion.find((v) => v.label === "…-rf2129992");
    // three devices acknowledged it (a, b, f); f's desired is the same string
    expect(current.count).toBe(3);
    expect(current.isCurrent).toBe(true);
    const old = s.byVersion.find((v) => v.label === "…-r79ddcd28");
    expect(old.isCurrent).toBe(false);
  });

  it("does not let the excluded device's old base become the current one", () => {
    const s = summarizeRollout(rows, { now: NOW });
    expect(s.byVersion.some((v) => v.base === "1777038061490")).toBe(false);
  });

  it("handles an empty fleet", () => {
    const s = summarizeRollout([], { now: NOW });
    expect(s.total).toBe(0);
    expect(s.byVersion).toEqual([]);
    expect(s.currentBase).toBe("");
  });
});

describe("convergenceSeries", () => {
  const since = new Date(NOW - 2 * DAY).toISOString();
  const v = "1788476532943-rf2129992";
  const rows = [
    { device_id: "a", is_connected: true, desired_policy_version: v, last_ack_policy_version: v, last_ack_status: 0, last_ack_at: iso(1.5 * DAY) },
    { device_id: "b", is_connected: true, desired_policy_version: v, last_ack_policy_version: v, last_ack_status: 0, last_ack_at: iso(1 * DAY), desired_changed_at: iso(1.2 * DAY), desired_change_reason: "catalog_rollout" },
    { device_id: "c", is_connected: true, desired_policy_version: v, last_ack_policy_version: "old", last_ack_status: 0 },
    { device_id: "d", is_connected: false, desired_policy_version: v, last_ack_policy_version: "old", last_ack_status: 0, last_heartbeat: iso(90 * DAY) },
  ];

  it("counts in-sync ACKs cumulatively from the change, over the active fleet, with catalog markers", () => {
    const s = convergenceSeries(rows, { since, now: NOW });
    expect(s.active).toBe(3);
    expect(s.inSync).toBe(2);
    expect(s.points.map((p) => p.inSync)).toEqual([0, 1, 2, 2]);
    expect(s.points[0].t).toBe(Date.parse(since));
    expect(s.points[s.points.length - 1].t).toBe(NOW);
    expect(s.markers).toHaveLength(1);
  });

  it("an ACK older than the change counts from the change, and no change means no series", () => {
    const s = convergenceSeries([{ ...rows[0], last_ack_at: iso(5 * DAY) }], { since, now: NOW });
    expect(s.points[1].t).toBe(Date.parse(since));
    expect(convergenceSeries(rows, { since: null, now: NOW }).points).toEqual([]);
  });
});
