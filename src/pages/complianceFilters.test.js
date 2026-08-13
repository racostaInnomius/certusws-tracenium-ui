// src/pages/complianceFilters.test.js

import { describe, it, expect } from "vitest";
import {
  compareVersionsReverse,
  bucketOfVersion,
  parseUrlFilters,
  deviceMatchesStatus,
  filterDevices,
} from "./complianceFilters";

describe("compareVersionsReverse", () => {
  it("orders highest-first and tolerates non-numeric segments", () => {
    expect(["1.1.0", "1.2.0", "1.1.5"].sort(compareVersionsReverse)).toEqual(["1.2.0", "1.1.5", "1.1.0"]);
    expect(compareVersionsReverse("1.0", "1.0.0")).toBe(0);
    expect(compareVersionsReverse("bad", "1.0.0")).toBeGreaterThan(0); // "bad"→0.0.0 < 1.0.0
  });
});

describe("bucketOfVersion", () => {
  it("buckets relative to the canonical latest", () => {
    expect(bucketOfVersion("1.2.0", "1.2.0")).toBe("current");
    expect(bucketOfVersion("1.3.0", "1.2.0")).toBe("current"); // newer than canonical
    expect(bucketOfVersion("1.2.2", "1.2.4")).toBe("one_behind"); // same major.minor, patch ≤2
    expect(bucketOfVersion("1.0.0", "1.2.4")).toBe("older");
    expect(bucketOfVersion("", "1.2.4")).toBe("unknown");
    expect(bucketOfVersion("1.2.0", null)).toBe("unknown");
  });
});

describe("parseUrlFilters", () => {
  it("reads and validates status/platform/versionBucket", () => {
    expect(parseUrlFilters("?status=fail&platform=linux&versionBucket=older")).toEqual({
      status: "fail",
      platform: "linux",
      versionBucket: "older",
      scoreBand: "",
    });
  });

  it("ignores unrecognized values", () => {
    expect(parseUrlFilters("?status=maybe&platform=solaris&versionBucket=ancient")).toEqual({
      status: "",
      platform: "",
      versionBucket: "",
      scoreBand: "",
    });
  });

  it("maps a legacy ?severity= (fail-proxy) to status=fail", () => {
    expect(parseUrlFilters("?severity=high").status).toBe("fail");
    expect(parseUrlFilters("?severity=bogus").status).toBe(""); // not a real severity
  });

  it("prefers an explicit status over the legacy severity", () => {
    expect(parseUrlFilters("?status=pass&severity=high").status).toBe("pass");
  });

  it("returns empty filters for an empty search", () => {
    expect(parseUrlFilters("")).toEqual({ status: "", platform: "", versionBucket: "", scoreBand: "" });
  });
});

describe("deviceMatchesStatus", () => {
  it("matches fail/non_compliant for 'fail' and pass/compliant for 'pass'", () => {
    expect(deviceMatchesStatus({ overallStatus: "fail" }, "fail")).toBe(true);
    expect(deviceMatchesStatus({ overallStatus: "non_compliant" }, "fail")).toBe(true);
    expect(deviceMatchesStatus({ overallStatus: "pass" }, "fail")).toBe(false);
    expect(deviceMatchesStatus({ overallStatus: "compliant" }, "pass")).toBe(true);
    expect(deviceMatchesStatus({ overallStatus: "fail" }, "pass")).toBe(false);
  });

  it("matches everything when no status filter is set", () => {
    expect(deviceMatchesStatus({ overallStatus: "insufficient_data" }, "")).toBe(true);
  });
});

describe("filterDevices", () => {
  const devices = [
    { agentId: "a", platform: "windows", overallStatus: "fail", agentVersion: "1.2.4" },
    { agentId: "b", platform: "linux", overallStatus: "pass", agentVersion: "1.2.2" },
    { agentId: "c", platform: "macos", overallStatus: "fail", agentVersion: "1.0.0" },
    { agentId: "d", platform: "linux", overallStatus: "insufficient_data", agentVersion: null },
  ];

  it("returns all devices when no filters are set", () => {
    expect(filterDevices(devices, {}).map((d) => d.agentId)).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by platform", () => {
    expect(filterDevices(devices, { platform: "linux" }).map((d) => d.agentId)).toEqual(["b", "d"]);
  });

  it("filters by status (fail)", () => {
    expect(filterDevices(devices, { status: "fail" }).map((d) => d.agentId)).toEqual(["a", "c"]);
  });

  it("combines platform + status (AND)", () => {
    expect(filterDevices(devices, { platform: "macos", status: "fail" }).map((d) => d.agentId)).toEqual(["c"]);
  });

  it("filters by version bucket relative to the fleet's canonical latest (1.2.4)", () => {
    // canonicalLatest = 1.2.4 → a current; b (1.2.2) one_behind; c (1.0.0) older; d unknown.
    expect(filterDevices(devices, { versionBucket: "older" }).map((d) => d.agentId)).toEqual(["c"]);
    expect(filterDevices(devices, { versionBucket: "one_behind" }).map((d) => d.agentId)).toEqual(["b"]);
    expect(filterDevices(devices, { versionBucket: "unknown" }).map((d) => d.agentId)).toEqual(["d"]);
  });

  it("is safe on non-array input", () => {
    expect(filterDevices(null, { status: "fail" })).toEqual([]);
  });
});

describe("score-band filter (Sprint 2 item 8)", () => {
  const devices = [
    { agentId: "a", overallScore: 95 },
    { agentId: "b", overallScore: 70 },
    { agentId: "c", overallScore: 20 },
    { agentId: "d", overallScore: null },
  ];

  it("parses ?score-band= with the health card's bucket vocabulary", () => {
    expect(parseUrlFilters("?score-band=good").scoreBand).toBe("good");
    expect(parseUrlFilters("?score-band=unscored").scoreBand).toBe("unscored");
    expect(parseUrlFilters("?score-band=purple").scoreBand).toBe("");
    expect(parseUrlFilters("").scoreBand).toBe("");
  });

  it("filters by band with the default 85/60 scale", () => {
    const ids = (band) =>
      filterDevices(devices, { scoreBand: band }).map((d) => d.agentId);
    expect(ids("good")).toEqual(["a"]);
    expect(ids("warning")).toEqual(["b"]);
    expect(ids("critical")).toEqual(["c"]);
    expect(ids("unscored")).toEqual(["d"]);
    expect(ids("")).toEqual(["a", "b", "c", "d"]);
  });

  it("honors tenant-configured bands so the click-through matches the card", () => {
    const bands = { goodMin: 96, warningMin: 60 };
    const ids = filterDevices(devices, { scoreBand: "warning" }, bands).map((d) => d.agentId);
    // 95 is 'warning' under goodMin=96 — same bucketing the card used.
    expect(ids).toEqual(["a", "b"]);
  });

  it("composes with the other filters", () => {
    const mixed = [
      { agentId: "w", overallScore: 95, platform: "windows", overallStatus: "pass" },
      { agentId: "l", overallScore: 95, platform: "linux", overallStatus: "pass" },
    ];
    const ids = filterDevices(mixed, { scoreBand: "good", platform: "linux" }).map((d) => d.agentId);
    expect(ids).toEqual(["l"]);
  });
});
