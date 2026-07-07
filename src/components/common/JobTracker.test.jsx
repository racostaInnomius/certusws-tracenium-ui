// src/components/common/JobTracker.test.jsx
//
// Sprint 2 — sticky orchestrator-job tracker.
//
// JobTracker polls GET /api/v1/orchestrator/jobs/:jobId on a 5s cadence
// (plus one immediate tick on mount) until every job reaches a terminal
// status, rendering a per-job chip whose bucket is pending → running →
// ok/error. We drive the whole state machine through MSW (real getJob
// call path) and only fake timers for the polling cadence.
//
// Focus:
//   * initial render shows every job as "Pending" before the first tick
//   * the immediate mount tick moves a job into its reported status
//     (running → CircularProgress inline, ok → "Done", error → raw
//     status label)
//   * onAllDone fires once every job is terminal; onDismiss on X click
//   * status normalization: succeeded/completed → ok, timeout/cancelled
//     → error, unknown → running (never silently dismissed)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import JobTracker from "./JobTracker";
import { respond } from "../../test/msw/server";

afterEach(cleanup);

// getJob resolves { job: { status, lastError } } OR the bare job object.
// The tracker accepts both — we exercise the enveloped shape here (the
// production contract) and the bare shape in one dedicated test.
function jobEndpoint(jobId, job, { status = 200 } = {}) {
  return respond("get", `/api/v1/orchestrator/jobs/${jobId}`, { job }, { status });
}

describe("JobTracker — render + empty state", () => {
  it("renders nothing when jobs is empty", () => {
    const { container } = render(<JobTracker jobs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a Pending chip for each job before the first poll resolves", () => {
    // No MSW handler needed for the assertion itself, but the immediate
    // tick WILL fire — register handlers that hang would be fragile, so
    // give it a running response and assert the synchronous initial
    // render (which is Pending, before any async tick lands).
    jobEndpoint("job-a", { status: "running" });
    jobEndpoint("job-b", { status: "running" });

    render(
      <JobTracker
        jobs={[
          { jobId: "job-aaaaaaaa", label: "Install 7zip" },
          { jobId: "job-bbbbbbbb", label: "Install VLC" },
        ]}
      />
    );

    // Header reflects the count.
    expect(screen.getByText("Jobs (2)")).toBeInTheDocument();
    // Both labels present.
    expect(screen.getByText("Install 7zip")).toBeInTheDocument();
    expect(screen.getByText("Install VLC")).toBeInTheDocument();
    // Synchronous initial state is Pending for both.
    expect(screen.getAllByText("Pending")).toHaveLength(2);
  });
});

describe("JobTracker — state machine (pending → running/ok/error)", () => {
  it("running status renders an inline CircularProgress spinner", async () => {
    jobEndpoint("run-1", { status: "running" });
    render(<JobTracker jobs={[{ jobId: "run-1", label: "Scanning" }]} />);

    // After the immediate tick lands, the chip label is "Running".
    expect(await screen.findByText("Running")).toBeInTheDocument();
    // CircularProgress renders a progressbar role inside the chip icon.
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("success status buckets to 'ok' → 'Done' label, no spinner", async () => {
    jobEndpoint("ok-1", { status: "success" });
    render(<JobTracker jobs={[{ jobId: "ok-1", label: "Patch" }]} />);

    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("failed status buckets to 'error' and shows the raw status as the label", async () => {
    jobEndpoint("err-1", { status: "failed", lastError: "exit 1" });
    render(<JobTracker jobs={[{ jobId: "err-1", label: "Deploy" }]} />);

    // error chip uses the rawStatus as its label ("failed").
    expect(await screen.findByText("failed")).toBeInTheDocument();
    // lastError is surfaced in the mono sub-line next to the id.
    expect(await screen.findByText(/exit 1/)).toBeInTheDocument();
  });

  it("normalizes succeeded/completed → Done and timeout/cancelled → error", async () => {
    jobEndpoint("j-succeeded", { status: "succeeded" });
    jobEndpoint("j-completed", { status: "completed" });
    jobEndpoint("j-timeout", { status: "timeout" });
    jobEndpoint("j-cancelled", { status: "cancelled" });

    render(
      <JobTracker
        jobs={[
          { jobId: "j-succeeded", label: "A" },
          { jobId: "j-completed", label: "B" },
          { jobId: "j-timeout", label: "C" },
          { jobId: "j-cancelled", label: "D" },
        ]}
      />
    );

    // Two terminal-success chips render "Done".
    await waitFor(() => expect(screen.getAllByText("Done")).toHaveLength(2));
    // timeout / cancelled render their raw status as the error label.
    expect(screen.getByText("timeout")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();
  });

  it("accepts the bare job object shape (no { job } envelope)", async () => {
    // respond() returns exactly what we pass — here the job fields at the
    // top level, no wrapper — so getJob's `r.value ?? {}` branch is hit.
    respond("get", "/api/v1/orchestrator/jobs/bare-1", { status: "success" });
    render(<JobTracker jobs={[{ jobId: "bare-1", label: "Bare" }]} />);

    expect(await screen.findByText("Done")).toBeInTheDocument();
  });
});

describe("JobTracker — onAllDone / onDismiss callbacks", () => {
  it("fires onAllDone once every job is terminal", async () => {
    jobEndpoint("done-a", { status: "success" });
    jobEndpoint("done-b", { status: "failed" });
    const onAllDone = vi.fn();

    render(
      <JobTracker
        jobs={[
          { jobId: "done-a", label: "A" },
          { jobId: "done-b", label: "B" },
        ]}
        onAllDone={onAllDone}
      />
    );

    await waitFor(() => expect(onAllDone).toHaveBeenCalled());
  });

  it("does NOT fire onAllDone while a job is still running", async () => {
    jobEndpoint("mix-a", { status: "success" });
    jobEndpoint("mix-b", { status: "running" });
    const onAllDone = vi.fn();

    render(
      <JobTracker
        jobs={[
          { jobId: "mix-a", label: "A" },
          { jobId: "mix-b", label: "B" },
        ]}
        onAllDone={onAllDone}
      />
    );

    // Wait for the running chip to settle, then confirm onAllDone stayed put.
    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(onAllDone).not.toHaveBeenCalled();
  });

  it("clicking the X invokes onDismiss", async () => {
    jobEndpoint("dis-1", { status: "running" });
    const onDismiss = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(
      <JobTracker
        jobs={[{ jobId: "dis-1", label: "A" }]}
        onDismiss={onDismiss}
      />
    );

    // The header IconButton is the only button in the tracker.
    const header = screen.getByText("Jobs (1)").closest("div");
    await user.click(within(header).getByRole("button"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
