// src/components/patch-management/deviceSearch.test.js

import { describe, it, expect } from "vitest";
import { filterPatchDevices, deviceStatusLabel, DEVICE_STATUS_LABEL } from "./deviceSearch";

const D = [
  { agentId: "5871a741-81be", hostname: "Msig13", platform: "windows", overallStatus: "installing", rebootRequired: false },
  { agentId: "8a4dc580-38ea", hostname: "DESKTOP-M8GJ0V5", platform: "windows", overallStatus: "updates_available", rebootRequired: false },
  { agentId: "eb40471c-763e", hostname: "MSIG-WSUS", platform: "windows", overallStatus: "healthy", rebootRequired: true },
  { agentId: "c0ffee00-0000", hostname: "srvoc-mainagent", platform: "linux", overallStatus: "healthy", rebootRequired: false },
];

describe("filterPatchDevices", () => {
  it("an empty query returns the same list, untouched", () => {
    expect(filterPatchDevices(D, "")).toBe(D);
    expect(filterPatchDevices(D, "   ")).toBe(D);
    expect(filterPatchDevices(null, "x")).toEqual([]);
  });

  it("matches hostname case-insensitively, as a substring", () => {
    expect(filterPatchDevices(D, "msig").map((d) => d.hostname)).toEqual(["Msig13", "MSIG-WSUS"]);
    expect(filterPatchDevices(D, "M8GJ").map((d) => d.hostname)).toEqual(["DESKTOP-M8GJ0V5"]);
  });

  it("matches the agent id, the platform, and the status key or its on-screen label", () => {
    expect(filterPatchDevices(D, "8a4dc580").map((d) => d.hostname)).toEqual(["DESKTOP-M8GJ0V5"]);
    expect(filterPatchDevices(D, "linux").map((d) => d.hostname)).toEqual(["srvoc-mainagent"]);
    expect(filterPatchDevices(D, "updates_available").map((d) => d.hostname)).toEqual(["DESKTOP-M8GJ0V5"]);
    expect(filterPatchDevices(D, "updates avail").map((d) => d.hostname)).toEqual(["DESKTOP-M8GJ0V5"]);
    expect(filterPatchDevices(D, "healthy").map((d) => d.hostname)).toEqual(["MSIG-WSUS", "srvoc-mainagent"]);
  });

  it("'reboot' finds devices with a reboot pending, whatever their status chip says", () => {
    expect(filterPatchDevices(D, "reboot").map((d) => d.hostname)).toEqual(["MSIG-WSUS"]);
  });

  it("every token must match: 'windows healthy' narrows to one", () => {
    expect(filterPatchDevices(D, "windows healthy").map((d) => d.hostname)).toEqual(["MSIG-WSUS"]);
    expect(filterPatchDevices(D, "windows nothing-like-this")).toEqual([]);
  });
});

describe("deviceStatusLabel", () => {
  it("maps every known status and falls back to Unknown", () => {
    for (const [k, label] of Object.entries(DEVICE_STATUS_LABEL)) expect(deviceStatusLabel(k)).toBe(label);
    expect(deviceStatusLabel("something_new")).toBe("Unknown");
    expect(deviceStatusLabel(undefined)).toBe("Unknown");
  });
});
