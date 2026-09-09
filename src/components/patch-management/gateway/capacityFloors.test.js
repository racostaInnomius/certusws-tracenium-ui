// src/components/patch-management/gateway/capacityFloors.test.js

import { describe, it, expect } from "vitest";
import {
  clampFloor,
  describeCapacityFloors,
  floorExample,
  FLOOR_DEFAULTS,
} from "./capacityFloors";

describe("clampFloor — mirrors the control plane so the form never lies", () => {
  it("keeps a sane value", () => {
    expect(clampFloor("minFreePercent", 5)).toBe(5);
    expect(clampFloor("minFreeGiB", 50)).toBe(50);
  });

  it("caps the percentage at half the datastore", () => {
    // Above 50% is not a safety margin, it is "never snapshot".
    expect(clampFloor("minFreePercent", 90)).toBe(50);
  });

  it("allows 0 — switching a floor off is a real choice", () => {
    expect(clampFloor("minFreePercent", 0)).toBe(0);
    expect(clampFloor("minFreeGiB", 0)).toBe(0);
  });

  it("refuses negatives and falls back on garbage", () => {
    expect(clampFloor("minFreePercent", -5)).toBe(0);
    expect(clampFloor("minFreeGiB", "abc")).toBe(FLOOR_DEFAULTS.minFreeGiB);
    expect(clampFloor("minFreeGiB", 99999)).toBe(4096);
  });

  it("truncates rather than rounding up into a stricter floor than typed", () => {
    expect(clampFloor("minFreePercent", 7.9)).toBe(7);
  });
});

describe("describeCapacityFloors", () => {
  it("⭐ states both floors and that they both have to hold", () => {
    const d = describeCapacityFloors({ minFreePercent: 10, minFreeGiB: 10 });
    expect(d.severity).toBe("info");
    expect(d.text).toContain("at least 10% of the datastore free");
    expect(d.text).toContain("at least 10 GiB free");
    expect(d.text).toContain("Both must hold");
  });

  it("⭐ warns plainly when the operator turns the whole check off", () => {
    const d = describeCapacityFloors({ minFreePercent: 0, minFreeGiB: 0 });
    expect(d.severity).toBe("warning");
    expect(d.text).toContain("No capacity check");
    expect(d.text).toContain("wedge the VM");
  });

  it("names the gap when only one floor is set", () => {
    const onlyPct = describeCapacityFloors({ minFreePercent: 5, minFreeGiB: 0 });
    expect(onlyPct.text).toContain("at least 5% of the datastore free");
    expect(onlyPct.text).not.toContain("GiB free");
    expect(onlyPct.text).toContain("Set the other floor");

    const onlyGiB = describeCapacityFloors({ minFreePercent: 0, minFreeGiB: 200 });
    expect(onlyGiB.text).toContain("at least 200 GiB free");
    expect(onlyGiB.text).not.toContain("% of the datastore");
  });

  it("always says thin-provisioned space is reported and not charged against the floors", () => {
    // The exact thing that made the gate refuse wrongly. An operator reading
    // these fields has to know it is no longer subtracted.
    expect(describeCapacityFloors(FLOOR_DEFAULTS).text).toContain("thin-provisioned");
    expect(describeCapacityFloors(FLOOR_DEFAULTS).text).toContain("not counted against");
  });

  it("survives being called with nothing", () => {
    expect(describeCapacityFloors().severity).toBe("info");
  });
});

describe("floorExample", () => {
  it("turns the percentage into GiB for a real datastore", () => {
    // 10% of the lab's 21.83 TiB store is ~2.2 TB — the figure that makes the
    // percentage concrete instead of abstract.
    expect(floorExample(10, 21.83)).toBe("10% of 21.83 TiB is 2235 GiB.");
  });

  it("says nothing when there is nothing to say", () => {
    expect(floorExample(0, 21.83)).toBe("");
    expect(floorExample(10, 0)).toBe("");
    expect(floorExample(10, undefined)).toBe("");
  });
});
