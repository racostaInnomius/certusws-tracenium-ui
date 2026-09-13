// src/components/Reports/reportSchedules.test.js
import { describe, expect, it } from "vitest";
import {
  describePeriod, recipientCount, runStatusColor, runStatusLabel, scheduleParamDefs, summarizeParams, triggerLabel, typeHasPeriod,
  periodOptionsFor, typeCoversMonthRange,
} from "./reportSchedules";

const PACK = {
  key: "scp.evidence-pack",
  params: [
    { name: "framework", label: "Framework", kind: "framework", required: true },
    { name: "from", label: "From month", kind: "month", required: true },
    { name: "to", label: "To month", kind: "month", required: true },
    { name: "assetGroupId", label: "Asset group", kind: "asset_group", required: false },
  ],
};

describe("reportSchedules helpers", () => {
  it("only month-bearing types have a period, and month params never reach the dialog", () => {
    expect(typeHasPeriod(PACK)).toBe(true);
    expect(typeHasPeriod({ key: "cdp.cbom" })).toBe(false);
    expect(scheduleParamDefs(PACK).map((p) => p.name)).toEqual(["framework", "assetGroupId"]);
  });

  it("⚠️ a single-month type only offers the previous month", () => {
    // Mirrors the backend's coversMonthRange: amp.asset-executive is rejected
    // with periodMonths > 1, so the dialog must not offer it.
    const ASSET = { key: "amp.asset-executive", params: [{ name: "month", kind: "month", required: true }] };
    expect(typeHasPeriod(ASSET)).toBe(true);
    expect(typeCoversMonthRange(ASSET)).toBe(false);
    expect(periodOptionsFor(ASSET).map((o) => o.value)).toEqual([1]);
    expect(typeCoversMonthRange(PACK)).toBe(true);
    expect(periodOptionsFor(PACK).map((o) => o.value)).toEqual([1, 3, 6, 12]);
  });

  it("describes the period in words", () => {
    expect(describePeriod(1)).toBe("Previous month");
    expect(describePeriod(12)).toBe("Previous 12 months");
    expect(describePeriod(5)).toBe("Previous 5 months");
  });

  it("summarizes stored params with names when it has them, raw values otherwise", () => {
    const s = { params: { framework: "soc2_tsc_2017", assetGroupId: "3" } };
    expect(summarizeParams(s, PACK)).toBe("soc2_tsc_2017 · Group 3");
    expect(summarizeParams(s, PACK, { frameworks: [{ framework: "soc2_tsc_2017", shortName: "SOC 2" }], groups: [{ id: 3, name: "Laptops" }] })).toBe("SOC 2 · Laptops");
    expect(summarizeParams({ params: { framework: "x" } }, PACK)).toBe("x · All devices");
    expect(summarizeParams({ params: {} }, { key: "cdp.cbom" })).toBe("");
  });

  it("counts members plus external recipients", () => {
    expect(recipientCount({ recipientMemberIds: [1, 2], recipientExternal: ["a@b.co"] })).toBe(3);
    expect(recipientCount({})).toBe(0);
  });

  it("labels statuses and triggers for humans", () => {
    expect(runStatusLabel("skipped_not_entitled")).toBe("Skipped (plugin not enabled)");
    expect(runStatusLabel(null)).toBe("—");
    expect(runStatusColor("sent")).toBe("success");
    expect(runStatusColor("not_sent")).toBe("warning");
    expect(runStatusColor("failed")).toBe("error");
    expect(triggerLabel("schedule")).toBe("Scheduled");
    expect(triggerLabel("manual")).toBe("Download");
  });
});
