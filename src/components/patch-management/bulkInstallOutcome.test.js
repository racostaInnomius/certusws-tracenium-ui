// src/components/patch-management/bulkInstallOutcome.test.js

import { describe, it, expect } from "vitest";
import { summarizeBulkInstall, goingOutNow, groupSkipReasons } from "./bulkInstallOutcome";

const dev = (agentId, status) => ({ agentId, hostname: agentId, jobId: `job-${agentId}`, kbCount: 2, status });

describe("summarizeBulkInstall", () => {
  it("⭐ never reports a held device as dispatched", () => {
    const r = summarizeBulkInstall({
      dispatched: [dev("a", "pending"), dev("b", "awaiting_snapshot"), dev("c", "awaiting_window")],
      skipped: [],
    });
    expect(r.message).toBe(
      "1 device being patched now · 1 waiting for a maintenance window · 1 waiting for a vCenter snapshot"
    );
    expect(r.severity).toBe("success");
  });

  it("⭐ nothing going out is not a success, even when every device is merely waiting", () => {
    const r = summarizeBulkInstall({ dispatched: [dev("a", "awaiting_window")], skipped: [] });
    expect(r.severity).toBe("info");
    expect(r.message).toBe("1 waiting for a maintenance window");
  });

  it("a device with no status is on its way — the ungated tenant is unchanged", () => {
    const r = summarizeBulkInstall({ dispatched: [dev("a"), dev("b")], skipped: [] });
    expect(r.message).toBe("2 devices being patched now");
    expect(r.severity).toBe("success");
  });

  it("counts the refused ones separately from the waiting ones", () => {
    const r = summarizeBulkInstall({
      dispatched: [dev("a", "pending")],
      skipped: [{ agentId: "b", reason: "gateway_unhealthy" }, { agentId: "c", reason: "no_matching_patches" }],
    });
    expect(r.message).toBe("1 device being patched now · 2 skipped");
  });

  it("says so plainly when nothing matched", () => {
    expect(summarizeBulkInstall({ dispatched: [], skipped: [] }, "Critical").message).toBe(
      "No devices matched the critical filter"
    );
  });

  it("survives a malformed response instead of throwing at the operator", () => {
    expect(summarizeBulkInstall(null).severity).toBe("info");
    expect(summarizeBulkInstall({ dispatched: "nope" }).severity).toBe("info");
  });
});

describe("goingOutNow", () => {
  it("is what the active-job tracker follows: a held job has nothing to report yet", () => {
    const out = goingOutNow([dev("a", "pending"), dev("b", "awaiting_snapshot"), dev("c")]);
    expect(out.map((d) => d.agentId)).toEqual(["a", "c"]);
  });
});

describe("groupSkipReasons", () => {
  it("collapses one gateway failure into one line, commonest first", () => {
    expect(
      groupSkipReasons([
        { reason: "gateway_unhealthy" },
        { reason: "no_matching_patches" },
        { reason: "gateway_unhealthy" },
      ])
    ).toEqual([
      { reason: "gateway_unhealthy", count: 2 },
      { reason: "no_matching_patches", count: 1 },
    ]);
  });
});
