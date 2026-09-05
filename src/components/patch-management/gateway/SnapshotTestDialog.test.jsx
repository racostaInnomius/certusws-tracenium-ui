// src/components/patch-management/gateway/SnapshotTestDialog.test.jsx
//
// The round-trip dialog against a faked control plane: offers the gateway's
// VMs, starts a test on the chosen one, follows it to a verdict, and turns a
// refusal into the next action.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = {
  listSnapshotCandidates: vi.fn(),
  startSnapshotTest: vi.fn(),
  listSnapshotTests: vi.fn(),
};
vi.mock("../../../api/patchManagement", () => ({
  listSnapshotCandidates: (...a) => api.listSnapshotCandidates(...a),
  startSnapshotTest: (...a) => api.startSnapshotTest(...a),
  listSnapshotTests: (...a) => api.listSnapshotTests(...a),
}));

import SnapshotTestDialog from "./SnapshotTestDialog";

const GW = { id: 1, name: "MSIG-vCenter-Gateway", health: "verified" };
const CANDIDATES = [
  { deviceId: "vm-radius", hostname: "MSIG-RADIUS-CA", platform: "windows", correlatable: true },
  { deviceId: "vm-odd", hostname: "MSIG-ODD", platform: "windows", correlatable: false },
];
const row = (over = {}) => ({
  id: 17,
  deviceId: "vm-radius",
  hostname: "MSIG-RADIUS-CA",
  outcome: "pending",
  matchedBy: null,
  vmMoref: null,
  snapshotMoref: null,
  reason: null,
  startedAt: "2026-09-05T10:00:00.000Z",
  finishedAt: null,
  cleanedAt: null,
  jobId: "job-17",
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.listSnapshotCandidates.mockResolvedValue({ candidates: CANDIDATES });
  api.listSnapshotTests.mockResolvedValue({ tests: [] });
  api.startSnapshotTest.mockResolvedValue({ queued: true, snapshotResultId: 17, jobId: "job-17" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SnapshotTestDialog", () => {
  it("offers the gateway's VMs, preselecting the first correlatable one", async () => {
    render(<SnapshotTestDialog open gateway={GW} onClose={() => {}} />);
    await waitFor(() => expect(api.listSnapshotCandidates).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("MSIG-RADIUS-CA"));
    expect(screen.getByText(/No snapshot test has been run/)).toBeInTheDocument();
  });

  it("⭐ starts the test on the chosen VM and follows it to Passed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const notify = vi.fn();
    // Polls: pending → created → cleaned.
    api.listSnapshotTests
      .mockResolvedValueOnce({ tests: [] }) // initial load
      .mockResolvedValueOnce({ tests: [row()] }) // right after start
      .mockResolvedValueOnce({ tests: [row({ outcome: "created", vmMoref: "vm-9637", matchedBy: "uuid_raw", snapshotMoref: "snapshot-777", finishedAt: "2026-09-05T10:00:08.000Z" })] })
      .mockResolvedValue({ tests: [row({ outcome: "cleaned", vmMoref: "vm-9637", matchedBy: "uuid_raw", snapshotMoref: "snapshot-777", finishedAt: "2026-09-05T10:00:08.000Z", cleanedAt: "2026-09-05T10:00:40.000Z" })] });

    render(<SnapshotTestDialog open gateway={GW} onClose={() => {}} notify={notify} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run test" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => expect(api.startSnapshotTest).toHaveBeenCalledWith(1, "vm-radius"));
    const live = await screen.findByTestId("snapshot-test-live");
    expect(within(live).getByText("Running")).toBeInTheDocument();

    // Two polls later the round trip is closed.
    await vi.advanceTimersByTimeAsync(3100);
    await vi.advanceTimersByTimeAsync(3100);
    await waitFor(() => expect(within(live).getByText("Passed")).toBeInTheDocument());
    expect(within(live).getByText(/vm-9637 — matched by BIOS UUID/)).toBeInTheDocument();
    expect(within(live).getByText(/snapshot-777 in 8 s/)).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("success", expect.stringContaining("Passed"));

    // Settled: no more polling.
    const calls = api.listSnapshotTests.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.listSnapshotTests.mock.calls.length).toBe(calls);
  });

  it("a refusal from the control plane becomes the next action, not a bare error", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.startSnapshotTest.mockRejectedValueOnce(
      Object.assign(new Error("HTTP 409"), { status: 409, body: { error: "target_not_virtual", message: "physical" } })
    );
    render(<SnapshotTestDialog open gateway={GW} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run test" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Run test" }));

    expect(await screen.findByText("Not a virtual machine")).toBeInTheDocument();
    expect(screen.getByText(/reports itself as physical/)).toBeInTheDocument();
  });

  it("warns and blocks when the gateway is not verified", async () => {
    render(<SnapshotTestDialog open gateway={{ ...GW, health: "failed" }} onClose={() => {}} />);
    expect(await screen.findByText(/The gateway is not verified/)).toBeInTheDocument();
  });
});
