// src/components/patch-management/exposureFilters.test.js

import { describe, it, expect } from "vitest";
import {
  EMPTY_EXPOSURE_FILTERS,
  exposurePlatforms,
  filterExposureRows,
  hasActiveExposureFilters,
  pageOfRow,
} from "./exposureFilters";

const rows = [
  { cveId: "CVE-1", title: "google chrome", platform: "windows", severity: "critical", knownExploited: true, sampleDevices: [{ hostname: "RAV-LAB-HI" }] },
  { cveId: "CVE-2", title: "firefox", platform: "macos", severity: "high", knownExploited: false, sampleDevices: [{ agentId: "a-9" }] },
  { cveId: "CVE-3", title: "git", platform: "linux", severity: "medium", sampleDevices: [] },
];
const ids = (r) => r.map((x) => x.cveId);

describe("filterExposureRows", () => {
  it("sin filtros, todo", () => {
    expect(ids(filterExposureRows(rows, EMPTY_EXPOSURE_FILTERS))).toEqual(["CVE-1", "CVE-2", "CVE-3"]);
  });
  it("busca en CVE, software y equipos, sin distinguir mayúsculas", () => {
    expect(ids(filterExposureRows(rows, { query: "cve-2" }))).toEqual(["CVE-2"]);
    expect(ids(filterExposureRows(rows, { query: "Chrome" }))).toEqual(["CVE-1"]);
    expect(ids(filterExposureRows(rows, { query: "rav-lab" }))).toEqual(["CVE-1"]);
    expect(ids(filterExposureRows(rows, { query: "a-9" }))).toEqual(["CVE-2"]); // sin hostname, el agentId
  });
  it("severidad, plataforma y sólo explotados se combinan", () => {
    expect(ids(filterExposureRows(rows, { severity: "high" }))).toEqual(["CVE-2"]);
    expect(ids(filterExposureRows(rows, { platform: "linux" }))).toEqual(["CVE-3"]);
    expect(ids(filterExposureRows(rows, { exploitedOnly: true }))).toEqual(["CVE-1"]);
    expect(ids(filterExposureRows(rows, { exploitedOnly: true, platform: "macos" }))).toEqual([]);
  });
});

describe("helpers", () => {
  it("hasActiveExposureFilters", () => {
    expect(hasActiveExposureFilters(EMPTY_EXPOSURE_FILTERS)).toBe(false);
    expect(hasActiveExposureFilters({ query: "  " })).toBe(false);
    expect(hasActiveExposureFilters({ exploitedOnly: true })).toBe(true);
  });
  it("exposurePlatforms sólo ofrece las que hay", () => {
    expect(exposurePlatforms(rows)).toEqual(["linux", "macos", "windows"]);
  });
  it("pageOfRow", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: i }));
    expect(pageOfRow(many, (r) => r.id === 0, 25)).toBe(0);
    expect(pageOfRow(many, (r) => r.id === 26, 25)).toBe(1);
    expect(pageOfRow(many, (r) => r.id === 99, 25)).toBe(-1);
  });
});
