// src/components/common/JobTracker.jsx
//
// Sticky bottom-right tracker for orchestrator jobs that the page
// just dispatched. Polls each job's `/orchestrator/jobs/:jobId`
// endpoint until it reaches a terminal status (success / failed /
// timeout / cancelled), updating the visible chip per job. Lets
// the operator see "still running on 5 devices" without leaving
// the page they're working on.
//
// API contract (caller side):
//   * Pass `jobs` as an array of `{ jobId, label }` objects.
//   * The tracker takes care of polling, status rendering, and
//     auto-dismissing terminal jobs after a short delay.
//   * `onAllDone` fires when every passed job is in a terminal
//     state — pages typically use this to refresh their dashboard
//     so the post-job state surfaces immediately.
//   * `onDismiss` fires when the operator clicks the X. Pages
//     should clear their `activeJobs` state in response.
//
// Why a custom component and not MUI Snackbar:
//   * Snackbar shows ONE message at a time; we routinely fire
//     multi-device dispatches with N parallel jobs.
//   * The status changes in place (pending → running → success);
//     re-firing snackbars per status would spam the operator.

import * as React from "react";
import { Box, Chip, IconButton, Typography, CircularProgress } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { getJob } from "../../api/jobs";

const POLL_MS = 5_000;
const TERMINAL_STATUSES = new Set(["success", "succeeded", "completed", "failed", "timeout", "cancelled"]);

// Map raw status strings to a normalized triage bucket so the chip
// rendering doesn't have to know every case. Backend may use
// "succeeded" or "completed"; agent ACK strings sometimes leak the
// raw protobuf status. Default unknowns to "running" so the
// tracker doesn't dismiss a job we've lost track of.
function bucketStatus(s) {
  const v = String(s || "").toLowerCase();
  if (v === "success" || v === "succeeded" || v === "completed") return "ok";
  if (v === "failed" || v === "timeout" || v === "cancelled") return "error";
  if (v === "pending") return "pending";
  return "running";
}

function statusChip(bucket, rawStatus) {
  const m = {
    ok:      { label: "Done",     fg: ROLE.positive,  bg: ROLE.positiveSoft },
    error:   { label: rawStatus || "Failed", fg: ROLE.critical, bg: ROLE.criticalSoft },
    pending: { label: "Pending",  fg: BRAND.gray,     bg: BRAND.surfaceMuted },
    running: { label: "Running",  fg: BRAND.tealText, bg: BRAND.tealSoft }
  };
  const cfg = m[bucket] || m.running;
  return (
    <Chip
      size="small"
      icon={
        bucket === "ok" ? <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />
        : bucket === "error" ? <ErrorOutlineOutlinedIcon sx={{ fontSize: 14 }} />
        : <CircularProgress size={10} thickness={6} sx={{ color: cfg.fg }} />
      }
      label={cfg.label}
      sx={{
        bgcolor: cfg.bg,
        color: cfg.fg,
        fontWeight: 700,
        fontSize: 11,
        height: 22,
        "& .MuiChip-icon": { color: cfg.fg, ml: "6px" }
      }}
    />
  );
}

export default function JobTracker({ jobs, onAllDone, onDismiss }) {
  // Internal state: jobId → { status, error, lastUpdate }. Initialized
  // from the prop so a job appears as "pending" until the first poll
  // tick lands a real status.
  const [statusMap, setStatusMap] = React.useState(() => {
    const m = {};
    for (const j of jobs) m[j.jobId] = { status: "pending", error: null };
    return m;
  });

  // When the parent passes a new job (or removes one), reconcile.
  // Runs only when the array of jobIds actually changes — listing the
  // jobs prop directly would re-fire on every render of the parent.
  const jobIdsKey = jobs.map((j) => j.jobId).join(",");
  React.useEffect(() => {
    setStatusMap((prev) => {
      const next = {};
      for (const j of jobs) {
        next[j.jobId] = prev[j.jobId] || { status: "pending", error: null };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobIdsKey]);

  // Poll non-terminal jobs. One interval handles all of them; per
  // tick we fan out N getJob requests in parallel. With <10 jobs
  // (the realistic upper bound for a fleet-wide bulk action that
  // an operator initiates by hand), the load is fine.
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const pending = jobs.filter((j) => {
        const s = statusMap[j.jobId]?.status;
        return !TERMINAL_STATUSES.has(String(s || "").toLowerCase());
      });
      if (pending.length === 0) return;

      const results = await Promise.allSettled(
        pending.map((j) => getJob(j.jobId))
      );
      if (cancelled) return;

      setStatusMap((prev) => {
        const next = { ...prev };
        results.forEach((r, idx) => {
          const jobId = pending[idx].jobId;
          if (r.status === "fulfilled") {
            const job = r.value?.job ?? r.value ?? {};
            next[jobId] = {
              status: String(job.status || "running").toLowerCase(),
              error: job.lastError || job.last_error || null
            };
          } else {
            // Network blip — keep previous status, tracker keeps
            // polling. Only surface as error if we never get a
            // status (caller can timeout themselves).
            next[jobId] = next[jobId] || { status: "running", error: null };
          }
        });
        return next;
      });
    };

    // Fire once immediately, then on cadence. Without the immediate
    // tick the UI shows "Pending" for the full POLL_MS even if the
    // job already ACKed — feels sluggish.
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobIdsKey]);

  // Notify parent when every job has reached a terminal state.
  const allDone = jobs.length > 0 && jobs.every((j) => {
    const s = statusMap[j.jobId]?.status;
    return TERMINAL_STATUSES.has(String(s || "").toLowerCase());
  });
  React.useEffect(() => {
    if (allDone) onAllDone?.();
  }, [allDone, onAllDone]);

  if (jobs.length === 0) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 16,
        right: 16,
        width: { xs: "calc(100% - 32px)", sm: 360 },
        maxHeight: "60vh",
        overflowY: "auto",
        bgcolor: "#ffffff",
        border: `1px solid ${BRAND.border}`,
        borderRadius: 2,
        boxShadow: "0 8px 24px rgba(59,64,77,0.15)",
        zIndex: 1400,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", px: 1.5, py: 1, borderBottom: `1px solid ${BRAND.border}` }}>
        <Typography sx={{ flex: 1, fontWeight: 800, color: BRAND.dark, fontSize: 13 }}>
          Jobs ({jobs.length})
        </Typography>
        <IconButton size="small" onClick={onDismiss}>
          <CloseOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        {jobs.map((j) => {
          const entry = statusMap[j.jobId] || { status: "pending", error: null };
          const bucket = bucketStatus(entry.status);
          return (
            <Box
              key={j.jobId}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.5,
                py: 1,
                borderBottom: `1px solid ${BRAND.border}`,
                "&:last-child": { borderBottom: "none" }
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.dark, lineHeight: 1.3 }} noWrap>
                  {j.label || `Job ${j.jobId.slice(0, 8)}`}
                </Typography>
                <Typography sx={{ fontSize: 10.5, color: BRAND.gray, fontFamily: "monospace" }} noWrap>
                  {j.jobId.slice(0, 8)}
                  {entry.error ? ` · ${entry.error}` : ""}
                </Typography>
              </Box>
              {statusChip(bucket, entry.status)}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
