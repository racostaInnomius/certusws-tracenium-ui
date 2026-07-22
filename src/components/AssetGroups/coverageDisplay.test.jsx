import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  formatPercent,
  formatNumber,
  getCoverageTone,
  getCoveragePalette,
  KindChip,
} from "./coverageDisplay";
import { ROLE, BRAND } from "../../theme/brand";

afterEach(cleanup);

describe("formatPercent", () => {
  it("rounds finite values and appends %", () => {
    expect(formatPercent(72.4)).toBe("72%");
    expect(formatPercent(72.6)).toBe("73%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(100)).toBe("100%");
  });
  it("falls back to 0% for non-finite / missing", () => {
    expect(formatPercent(null)).toBe("0%");
    expect(formatPercent(undefined)).toBe("0%");
    expect(formatPercent("nope")).toBe("0%");
    expect(formatPercent(NaN)).toBe("0%");
  });
});

describe("formatNumber", () => {
  it("groups thousands with en-US separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(0)).toBe("0");
  });
  it("falls back to 0 for non-finite / missing", () => {
    expect(formatNumber(null)).toBe("0");
    expect(formatNumber("x")).toBe("0");
  });
});

describe("getCoverageTone", () => {
  it("is success when nothing is ungrouped", () => {
    expect(getCoverageTone({ ungroupedDevices: 0, coveragePercent: 10 })).toBe("success");
    expect(getCoverageTone({})).toBe("success");
  });
  it("maps coverage percent to info/warning/critical when there are ungrouped devices", () => {
    expect(getCoverageTone({ ungroupedDevices: 3, coveragePercent: 90 })).toBe("info");
    expect(getCoverageTone({ ungroupedDevices: 3, coveragePercent: 85 })).toBe("info");
    expect(getCoverageTone({ ungroupedDevices: 3, coveragePercent: 70 })).toBe("warning");
    expect(getCoverageTone({ ungroupedDevices: 3, coveragePercent: 60 })).toBe("warning");
    expect(getCoverageTone({ ungroupedDevices: 3, coveragePercent: 40 })).toBe("critical");
  });
});

describe("getCoveragePalette", () => {
  it("maps each tone to a role/brand color", () => {
    expect(getCoveragePalette("success")).toEqual({ color: ROLE.positive });
    expect(getCoveragePalette("critical")).toEqual({ color: ROLE.critical });
    expect(getCoveragePalette("warning")).toEqual({ color: ROLE.caution });
    expect(getCoveragePalette("info")).toEqual({ color: BRAND.tealText });
    expect(getCoveragePalette("anything-else")).toEqual({ color: BRAND.tealText });
  });
});

describe("KindChip", () => {
  it("labels dynamic groups", () => {
    render(<KindChip kind="dynamic" />);
    expect(screen.getByText("Dynamic")).toBeInTheDocument();
  });
  it("labels static groups (default for anything not dynamic)", () => {
    render(<KindChip kind="static" />);
    expect(screen.getByText("Static")).toBeInTheDocument();
  });
});
