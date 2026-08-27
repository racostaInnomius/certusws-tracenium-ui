// src/components/patch-management/buildWorklist.test.js
//
// The queue that replaces the five counters at the top of Patch Management.
// Its only job is to be right about what comes first — a ranked list that
// puts the wrong thing at the top is worse than no ranking at all, because
// people act on the top row.
//
// The order mirrors cve-detection.service.ts deliberately: past-due KEV, then
// actively exploited, then severity, then CVSS, then blast radius. Pinned here
// so the two cannot drift apart and start disagreeing about the same fleet.

import { describe, it, expect } from "vitest";
import { buildWorklist, byPriority, reasonFor, fromExposure, fromFinding } from "./buildWorklist";

const cve = (over) => ({
  cveId: "CVE-2026-0001",
  title: "Something bad",
  severity: "high",
  cvssScore: 7.5,
  knownExploited: false,
  kevOverdue: false,
  affectedDeviceCount: 1,
  ...over,
});

const finding = (over) => ({
  checkId: "windows.firewall.enabled",
  title: "Firewall disabled",
  severity: "high",
  devicesAffected: 1,
  agentRemediable: false,
  ...over,
});

describe("what comes first", () => {
  it("puts a past-due KEV above everything", () => {
    // CISA BOD 22-01 put a date on these; nothing else in the list has one.
    const list = buildWorklist(
      [cve({ cveId: "CVE-overdue", kevOverdue: true, knownExploited: true, severity: "medium", cvssScore: 5 }),
       cve({ cveId: "CVE-crit", severity: "critical", cvssScore: 9.9 })],
      [finding({ checkId: "crit.finding", severity: "critical", devicesAffected: 500 })]
    );
    expect(list[0].id).toBe("CVE-overdue");
  });

  it("puts an exploited CVE above a higher-scoring one that is not", () => {
    const list = buildWorklist([
      cve({ cveId: "CVE-quiet", severity: "critical", cvssScore: 9.8 }),
      cve({ cveId: "CVE-exploited", severity: "medium", cvssScore: 5.1, knownExploited: true }),
    ]);
    expect(list[0].id).toBe("CVE-exploited");
  });

  it("falls back to severity, then score, then blast radius", () => {
    const list = buildWorklist([
      cve({ cveId: "low-blast", severity: "high", cvssScore: 7.5, affectedDeviceCount: 2 }),
      cve({ cveId: "high-blast", severity: "high", cvssScore: 7.5, affectedDeviceCount: 40 }),
      cve({ cveId: "higher-score", severity: "high", cvssScore: 8.8, affectedDeviceCount: 1 }),
      cve({ cveId: "critical", severity: "critical", cvssScore: 7.0, affectedDeviceCount: 1 }),
    ]);
    expect(list.map((i) => i.id)).toEqual(["critical", "higher-score", "high-blast", "low-blast"]);
  });

  it("breaks a true tie in favour of what can be fixed from here", () => {
    // Never outranks urgency — only decides between two equally urgent things,
    // in favour of the one you can actually finish today.
    const list = buildWorklist([], [
      finding({ checkId: "manual", agentRemediable: false }),
      finding({ checkId: "one-click", agentRemediable: true }),
    ]);
    expect(list[0].id).toBe("one-click");
  });

  it("does not let fixability jump a severity band", () => {
    const list = buildWorklist([], [
      finding({ checkId: "fixable-medium", severity: "medium", agentRemediable: true }),
      finding({ checkId: "manual-critical", severity: "critical", agentRemediable: false }),
    ]);
    expect(list[0].id).toBe("manual-critical");
  });
});

describe("mixing the two sources", () => {
  it("interleaves CVEs and findings by urgency, not by kind", () => {
    // The whole point of one queue: two lists stapled together would put all
    // the CVEs first regardless of what the findings say.
    const list = buildWorklist(
      [cve({ cveId: "cve-medium", severity: "medium", cvssScore: 5 })],
      [finding({ checkId: "finding-critical", severity: "critical" })]
    );
    expect(list.map((i) => i.id)).toEqual(["finding-critical", "cve-medium"]);
  });

  it("does not invent a CVSS for a config finding", () => {
    // Faking a score to make findings sortable would silently promote them
    // over CVEs that carry a real one.
    expect(fromFinding(finding({})).cvssScore).toBeNull();
  });

  it("lets a real score break a tie against a finding of equal severity", () => {
    const list = buildWorklist(
      [cve({ cveId: "scored", severity: "high", cvssScore: 7.5, affectedDeviceCount: 1 })],
      [finding({ checkId: "unscored", severity: "high", devicesAffected: 1 })]
    );
    expect(list[0].id).toBe("scored");
  });

  it("never claims a CVE is one-click fixable", () => {
    // Exposure is closed by updating the software, not from this row.
    expect(fromExposure(cve({})).fixable).toBe(false);
  });
});

describe("the list explains itself", () => {
  it("names the deadline before anything else", () => {
    expect(reasonFor({ kevOverdue: true, knownExploited: true, severity: "low", devicesAffected: 1 }))
      .toMatch(/deadline/i);
  });

  it("says exploitation in plain words", () => {
    expect(reasonFor({ knownExploited: true, severity: "medium", devicesAffected: 1 }))
      .toMatch(/exploited/i);
  });

  it("counts the blast radius when there is one", () => {
    expect(reasonFor({ severity: "critical", devicesAffected: 12 })).toContain("12");
  });

  it("always gives a reason", () => {
    for (const item of [
      { severity: "low", devicesAffected: 1 },
      { severity: undefined, devicesAffected: 0 },
      {},
    ]) {
      expect(reasonFor(item)?.trim()).toBeTruthy();
    }
  });
});

describe("robustness", () => {
  it("survives empty and malformed input", () => {
    expect(buildWorklist()).toEqual([]);
    expect(buildWorklist(null, undefined)).toEqual([]);
    expect(buildWorklist([{}], [{}])).toEqual([]); // no ids → nothing to act on
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => cve({ cveId: `CVE-${i}` }));
    expect(buildWorklist(many, [], 5)).toHaveLength(5);
    expect(buildWorklist(many, [], 0)).toHaveLength(0);
  });

  it("treats an unknown severity as the bottom, not the top", () => {
    // A missing severity must never be sorted as if it were critical.
    const list = buildWorklist([], [
      finding({ checkId: "unknown-sev", severity: "wat" }),
      finding({ checkId: "low-sev", severity: "low" }),
    ]);
    expect(list[0].id).toBe("low-sev");
  });

  it("is a stable, total order", () => {
    const a = fromFinding(finding({ checkId: "a" }));
    const b = fromFinding(finding({ checkId: "b" }));
    expect(byPriority(a, b)).toBe(0);
    expect(byPriority(a, a)).toBe(0);
  });
});

describe("the queue can route to what it recommends", () => {
  it("carries the category so the caller knows which surface renders it", () => {
    // Without this the button switched tabs to a page that did not contain
    // the row it had just promised — the reason "See finding" looked broken.
    expect(fromFinding(finding({ category: "firewall" })).category).toBe("firewall");
    expect(fromFinding(finding({ category: "patching" })).category).toBe("patching");
  });

  it("keeps the id addressable — it is the checkId the panel matches on", () => {
    expect(fromFinding(finding({ checkId: "windows.smb.v1_disabled" })).id)
      .toBe("windows.smb.v1_disabled");
  });

  it("tolerates a finding with no category rather than dropping it", () => {
    // An uncategorised finding still belongs in the queue; it simply routes to
    // the catch-all surface.
    const item = fromFinding(finding({ category: undefined }));
    expect(item.category).toBeNull();
    expect(item.id).toBeTruthy();
  });

  it("does not put a category on a CVE", () => {
    // CVEs route by kind, not category; inventing one would be a lie the
    // router could act on.
    expect(fromExposure(cve({})).category).toBeUndefined();
  });
});
