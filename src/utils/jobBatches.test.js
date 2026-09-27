// src/utils/jobBatches.test.js
//
// Unit coverage for buildBatchRow — the aggregation logic that
// collapses every job sharing a batch_id (one multi-device dispatch)
// into a single Tenant Job History row.

import { describe, expect, it } from "vitest";
import { buildBatchRow } from "./jobBatches";

function job(overrides = {}) {
  return {
    job_id: "job-1",
    device_id: "dev-1",
    job_type: "patch_install",
    status: "pending",
    created_at: "2026-08-17T10:00:00.000Z",
    created_by: "auth0|abc",
    created_by_email: "op@example.com",
    completed_at: null,
    last_error: null,
    ...overrides,
  };
}

describe("buildBatchRow", () => {
  it("reports 'running' while any job in the batch is still in flight", () => {
    const row = buildBatchRow("batch-1", [
      job({ job_id: "j1", status: "completed", completed_at: "2026-08-17T10:05:00.000Z" }),
      job({ job_id: "j2", status: "running" }),
      job({ job_id: "j3", status: "pending" }),
    ]);

    expect(row.status).toBe("running");
    expect(row.__doneCount).toBe(1);
    expect(row.__failedCount).toBe(0);
    expect(row.__totalCount).toBe(3);
    // Not everything is terminal yet — no aggregate completion time.
    expect(row.completed_at).toBeNull();
  });

  it("reports 'completed' once every job succeeded", () => {
    const row = buildBatchRow("batch-2", [
      job({ job_id: "j1", status: "completed", completed_at: "2026-08-17T10:05:00.000Z" }),
      job({ job_id: "j2", status: "completed", completed_at: "2026-08-17T10:06:30.000Z" }),
    ]);

    expect(row.status).toBe("completed");
    expect(row.__doneCount).toBe(2);
    expect(row.__failedCount).toBe(0);
    // Aggregate completion = the last device to finish.
    expect(row.completed_at).toBe("2026-08-17T10:06:30.000Z");
  });

  it("reports 'failed' once terminal with at least one failure, keeping the partial count", () => {
    const row = buildBatchRow("batch-3", [
      job({ job_id: "j1", status: "completed", completed_at: "2026-08-17T10:05:00.000Z" }),
      job({ job_id: "j2", status: "failed", last_error: "connect_timeout", completed_at: "2026-08-17T10:05:30.000Z" }),
      job({ job_id: "j3", status: "timeout", completed_at: "2026-08-17T10:06:00.000Z" }),
    ]);

    expect(row.status).toBe("failed");
    expect(row.__doneCount).toBe(3);
    expect(row.__failedCount).toBe(2);
    expect(row.__totalCount).toBe(3);
    expect(row.last_error).toBe("connect_timeout");
  });

  it("reports 'failed' when every job in the batch failed", () => {
    const row = buildBatchRow("batch-4", [
      job({ job_id: "j1", status: "failed" }),
      job({ job_id: "j2", status: "cancelled" }),
    ]);

    expect(row.status).toBe("failed");
    expect(row.__failedCount).toBe(2);
    expect(row.__totalCount).toBe(2);
  });

  it("uses the earliest created_at across the batch (dispatch loop timestamps drift by a few ms)", () => {
    const row = buildBatchRow("batch-5", [
      job({ job_id: "j1", created_at: "2026-08-17T10:00:00.050Z" }),
      job({ job_id: "j2", created_at: "2026-08-17T10:00:00.010Z" }),
      job({ job_id: "j3", created_at: "2026-08-17T10:00:00.090Z" }),
    ]);

    expect(row.created_at).toBe("2026-08-17T10:00:00.010Z");
  });

  it("carries the synthetic id and job list needed by the UI", () => {
    const jobs = [job({ job_id: "j1" }), job({ job_id: "j2" })];
    const row = buildBatchRow("batch-6", jobs);

    expect(row.job_id).toBe("batch:batch-6");
    expect(row.batch_id).toBe("batch-6");
    expect(row.__isBatch).toBe(true);
    expect(row.__jobs).toBe(jobs);
    expect(row.device_id).toBeNull();
  });
});

describe("un lote a UN equipo (27-sep: «dice 20 devices y es solo 1»)", () => {
  it("⭐ cuenta equipos distintos, no jobs", async () => {
    const { buildBatchRow } = await import("./jobBatches");
    const jobs = Array.from({ length: 20 }, (_, i) => ({ job_id: `j${i}`, device_id: "w11", status: "completed" }));
    const row = buildBatchRow("b", jobs);
    expect(row.__totalCount).toBe(20);
    expect(row.__deviceCount).toBe(1);
    expect(buildBatchRow("b2", [{ job_id: "a", device_id: "d1", status: "completed" }, { job_id: "b", device_id: "d2", status: "completed" }]).__deviceCount).toBe(2);
  });

  it("jobPayloadLabel dice qué hace cada job", async () => {
    const { jobPayloadLabel } = await import("./jobBatches");
    expect(jobPayloadLabel({ payload_json: { checkSnapshot: { title: "Incognito mode must be disabled." } } })).toBe("Incognito mode must be disabled.");
    expect(jobPayloadLabel({ payload_json: JSON.stringify({ checkSnapshot: { title: "X", revertOf: { resultId: 1 } } }) })).toBe("Revert: X");
    expect(jobPayloadLabel({ payload_json: { items: [{}, {}, {}] } })).toBe("3 fixes");
    expect(jobPayloadLabel({ payload_json: { factType: "compliance" } })).toBe("Facts: compliance");
    expect(jobPayloadLabel({ payload_json: null })).toBeNull();
  });
});
