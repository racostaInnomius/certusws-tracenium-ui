// src/components/patch-management/gateway/snapshotTest.test.js

import { describe, it, expect } from "vitest";
import {
  snapshotTestStage,
  isSnapshotTestSettled,
  snapshotTestSteps,
  describeSnapshotTest,
  describeSnapshotTestStartError,
  formatDuration,
} from "./snapshotTest";

const base = {
  id: 17,
  deviceId: "vm-1",
  hostname: "MSIG-RADIUS-CA",
  startedAt: "2026-09-05T10:00:00.000Z",
  finishedAt: null,
  cleanedAt: null,
  matchedBy: null,
  vmMoref: null,
  snapshotMoref: null,
  reason: null,
};

describe("snapshotTestStage", () => {
  it("passed only once the snapshot is confirmed gone", () => {
    expect(snapshotTestStage(null)).toBe("idle");
    expect(snapshotTestStage({ ...base, outcome: "pending" })).toBe("running");
    expect(snapshotTestStage({ ...base, outcome: "created" })).toBe("cleaning");
    expect(snapshotTestStage({ ...base, outcome: "cleaned", cleanedAt: "2026-09-05T10:01:00.000Z" })).toBe("passed");
    expect(snapshotTestStage({ ...base, outcome: "not_correlated" })).toBe("failed");
    expect(isSnapshotTestSettled({ ...base, outcome: "created" })).toBe(false);
    expect(isSnapshotTestSettled({ ...base, outcome: "rejected" })).toBe(true);
  });
});

describe("snapshotTestSteps", () => {
  it("⭐ a full round trip reads as three green steps with the evidence", () => {
    const steps = snapshotTestSteps({
      ...base,
      outcome: "cleaned",
      finishedAt: "2026-09-05T10:00:08.000Z",
      cleanedAt: "2026-09-05T10:00:40.000Z",
      matchedBy: "uuid_raw",
      vmMoref: "vm-9637",
      snapshotMoref: "snapshot-777",
    });
    expect(steps.map((s) => s.status)).toEqual(["ok", "ok", "ok"]);
    expect(steps[0].detail).toBe("vm-9637 — matched by BIOS UUID");
    expect(steps[1].detail).toBe("snapshot-777 in 8 s");
    expect(steps[2].detail).toMatch(/^Confirmed gone /);
  });

  it("not correlated fails at step one and skips the rest", () => {
    const steps = snapshotTestSteps({ ...base, outcome: "not_correlated", reason: "no vcenter vm matched any correlation key" });
    expect(steps.map((s) => s.status)).toEqual(["failed", "skipped", "skipped"]);
    expect(steps[0].detail).toBe("no vcenter vm matched any correlation key");
  });

  it("a rejected snapshot on a correlated VM fails at step two", () => {
    const steps = snapshotTestSteps({ ...base, outcome: "rejected", vmMoref: "vm-9637", matchedBy: "serial_smbios", reason: "datastore_too_full" });
    expect(steps.map((s) => s.status)).toEqual(["ok", "failed", "skipped"]);
    expect(steps[0].detail).toContain("VMware serial");
    expect(steps[1].detail).toBe("datastore_too_full");
  });

  it("while removing, the third step is pending and says so", () => {
    const steps = snapshotTestSteps({ ...base, outcome: "created", vmMoref: "vm-1", snapshotMoref: "snapshot-2" });
    expect(steps[2]).toMatchObject({ status: "pending", detail: "Removal queued on the gateway" });
  });

  it("running shows three pending steps", () => {
    expect(snapshotTestSteps({ ...base, outcome: "pending" }).every((s) => s.status === "pending")).toBe(true);
  });
});

describe("describeSnapshotTest / describeSnapshotTestStartError", () => {
  it("names the verdict", () => {
    expect(describeSnapshotTest({ ...base, outcome: "cleaned", cleanedAt: "x" }).label).toBe("Passed");
    expect(describeSnapshotTest({ ...base, outcome: "not_correlated" }).label).toBe("Not correlated");
    expect(describeSnapshotTest({ ...base, outcome: "created" }).label).toBe("Removing");
  });

  it("turns every refusal code into a next action, and keeps the server message otherwise", () => {
    for (const code of [
      "gateway_credential_missing",
      "gateway_not_verified",
      "gateway_cannot_snapshot_itself",
      "target_unknown",
      "target_not_virtual",
      "target_has_no_identifiers",
    ]) {
      const d = describeSnapshotTestStartError({ error: code });
      expect(d.title).not.toBe("Could not start the snapshot test.");
      expect(d.body.length).toBeGreaterThan(10);
    }
    expect(describeSnapshotTestStartError({ error: "internal_error", message: "boom" })).toEqual({
      title: "Could not start the snapshot test.",
      body: "boom",
    });
  });
});

describe("formatDuration", () => {
  it("scales with the size of the wait", () => {
    expect(formatDuration({ startedAt: "2026-09-05T10:00:00.000Z", finishedAt: "2026-09-05T10:00:00.400Z" })).toBe("400 ms");
    expect(formatDuration({ startedAt: "2026-09-05T10:00:00.000Z", finishedAt: "2026-09-05T10:00:42.000Z" })).toBe("42 s");
    expect(formatDuration({ startedAt: "2026-09-05T10:00:00.000Z", finishedAt: "2026-09-05T10:02:05.000Z" })).toBe("2 min 5 s");
    expect(formatDuration({ startedAt: "2026-09-05T10:00:00.000Z", finishedAt: null })).toBe("");
  });
});
