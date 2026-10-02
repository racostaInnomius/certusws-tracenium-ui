// src/components/patch-management/SnapshotHistoryPanel.test.jsx
//
// ADR-0038 D10 — el historial de puntos de restauración.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({ listSnapshotHistory: vi.fn() }));
vi.mock("../../api/patchManagement", () => api);

import SnapshotHistoryPanel from "./SnapshotHistoryPanel";

const entry = (over = {}) => ({
  id: 8, stage: "removed", outcome: "cleaned", purpose: "patch", deviceId: "d1", hostname: "FTP-SPS", vmMoref: "vm-36",
  gatewayDeviceId: "g1", gatewayName: "MSIG-vCenter-Gateway", deploymentId: null,
  requestedAt: "2026-09-19T03:00:15Z", removedAt: "2026-09-21T03:00:15Z", requestedBy: "2", requestedByEmail: "ops@msig.com",
  removedBy: "operator", releasedBy: "2", releasedByEmail: "ops@msig.com", releaseReason: "validated",
  revert: null, mergedIntoId: null, live: null,
  jobs: [{ jobId: "a", status: "failed", verification: null }, { jobId: "b", status: "completed", verification: "passed" }],
  ...over,
});
const page = (items, over = {}) => ({
  ok: true, items, total: items.length, gateways: [{ deviceId: "g1", name: "MSIG-vCenter-Gateway" }],
  counts: { requested: 0, live: 1, removed: 12, failed: 0, merged: 1, reverted: 0 }, ...over,
});

beforeEach(() => api.listSnapshotHistory.mockReset());
afterEach(cleanup);

describe("SnapshotHistoryPanel", () => {
  it("⭐ each snapshot says what it protected, who asked, how it ended and how the change looked after", async () => {
    api.listSnapshotHistory.mockResolvedValue(page([entry()]));
    render(<SnapshotHistoryPanel />);
    const row = (await screen.findByText("FTP-SPS")).closest("tr");
    expect(within(row).getByText("2 patch runs")).toBeInTheDocument();
    expect(within(row).getByText("by ops@msig.com")).toBeInTheDocument();
    expect(within(row).getByText("Released")).toBeInTheDocument();
    expect(within(row).getByText("Released by ops@msig.com — Validated")).toBeInTheDocument();
    expect(within(row).getByText("Checked healthy")).toBeInTheDocument();
    expect(within(row).getByText("2 days")).toBeInTheDocument();
  });

  it("filters by status on the server, with counts on each filter", async () => {
    const user = userEvent.setup();
    api.listSnapshotHistory.mockResolvedValue(page([entry()]));
    render(<SnapshotHistoryPanel />);
    await screen.findByText("FTP-SPS");
    expect(screen.getByRole("button", { name: "All · 14" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Shared · 1" }));
    await waitFor(() => expect(api.listSnapshotHistory).toHaveBeenLastCalledWith(expect.objectContaining({ status: "merged", offset: 0 })));
  });

  it("pages with Show more", async () => {
    const user = userEvent.setup();
    api.listSnapshotHistory.mockResolvedValueOnce(page([entry()], { total: 2 })).mockResolvedValueOnce(page([entry({ id: 9, hostname: "MSIG-TSPDC" })], { total: 2 }));
    render(<SnapshotHistoryPanel />);
    await user.click(await screen.findByRole("button", { name: "Show more (1 left)" }));
    expect(await screen.findByText("MSIG-TSPDC")).toBeInTheDocument();
    expect(screen.getByText("FTP-SPS")).toBeInTheDocument();
    expect(api.listSnapshotHistory).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }));
  });
});
