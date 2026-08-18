// src/utils/jobBatches.js
//
// Collapses jobs that share a batch_id (one multi-device dispatch —
// see the backend's orchestrator.service.ts createTenantJob) into a
// single Tenant Job History row. Pulled out of Jobs.jsx so it can be
// unit-tested directly without React Fast Refresh complaining about a
// page file exporting a non-component.

export const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "timeout", "cancelled"]);
export const FAILED_JOB_STATUSES = new Set(["failed", "timeout", "cancelled"]);

// Kept deliberately coarse: the aggregate `status` is only ever
// "running" (still ≥1 job in flight), "completed" (all succeeded), or
// "failed" (all terminal, ≥1 not success) — enough to drive the
// existing status filter and a still-informative chip via
// __doneCount/__failedCount/__totalCount, without trying to reproduce
// every individual pending/sent/retrying nuance at the group level.
export function buildBatchRow(batchId, jobs) {
  const statuses = jobs.map((j) => String(j.status || "").toLowerCase());
  const totalCount = jobs.length;
  const doneCount = statuses.filter((s) => TERMINAL_JOB_STATUSES.has(s)).length;
  const failedCount = statuses.filter((s) => FAILED_JOB_STATUSES.has(s)).length;

  const earliestCreatedAt = jobs.reduce(
    (min, j) => (j.created_at && (!min || j.created_at < min) ? j.created_at : min),
    null
  );
  const completedTimes = jobs.map((j) => j.completed_at).filter(Boolean);
  const lastCompletedAt =
    doneCount === totalCount && completedTimes.length
      ? completedTimes.reduce((max, t) => (t > max ? t : max))
      : null;

  return {
    job_id: `batch:${batchId}`,
    batch_id: batchId,
    __isBatch: true,
    __jobs: jobs,
    __doneCount: doneCount,
    __failedCount: failedCount,
    __totalCount: totalCount,
    job_type: jobs[0]?.job_type,
    created_at: earliestCreatedAt,
    created_by: jobs[0]?.created_by,
    created_by_email: jobs[0]?.created_by_email,
    completed_at: lastCompletedAt,
    last_error: jobs.find((j) => j.last_error)?.last_error || null,
    attempts: null,
    device_id: null,
    status: doneCount < totalCount ? "running" : failedCount === 0 ? "completed" : "failed",
  };
}
