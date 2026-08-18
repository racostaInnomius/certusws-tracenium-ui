import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// The drawer and its sub-widgets (FleetRankingLine eager-fetches, DeviceDiffSection
// / FindingHistoryDialog fetch on interaction, the mutation handlers call the API)
// all import from api/compliance — mock the whole module so nothing hits the network.
vi.mock("../../api/compliance", () => ({
  getDeviceFleetRanking: vi.fn().mockResolvedValue({ ok: true, ranking: null }),
  getDeviceFindingsDiff: vi.fn().mockResolvedValue({ ok: true, diff: { referenceSnapshotAt: null } }),
  getFindingHistory: vi.fn().mockResolvedValue({ ok: true, events: [] }),
  acknowledgeFinding: vi.fn().mockResolvedValue({ ok: true }),
  revokeFindingAcknowledgement: vi.fn().mockResolvedValue({ ok: true }),
  updateFindingRemediationStatus: vi.fn().mockResolvedValue({ ok: true }),
  bulkFindingOp: vi.fn().mockResolvedValue({ ok: true, summary: { ok: 1, failed: 0, total: 1 } }),
}));
import { getDeviceFleetRanking } from "../../api/compliance";
import DeviceDrawerContent from "./DeviceDrawerContent";

const baseProps = {
  agentId: "agent-1",
  loading: false,
  timeseries: null,
  onClose: vi.fn(),
  frameworkLabels: new Map(),
  onNavigateToAsset: vi.fn(),
  onRequestRefetch: vi.fn(),
  onToast: vi.fn(),
};

const deviceData = {
  device: {
    hostname: "host-a",
    platform: "windows",
    overallStatus: "fail",
    overallScore: 72,
    scoresByFramework: {},
  },
  findings: [
    { id: 1, checkId: "cis:1.1", title: "Check one", severity: "critical", status: "fail", category: "access_control" },
    { id: 2, checkId: "cis:2.2", title: "Check two", severity: "low", status: "pass", category: "access_control" },
  ],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("DeviceDrawerContent", () => {
  it("returns null without an agentId", () => {
    const { container } = render(<DeviceDrawerContent {...baseProps} agentId={null} data={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a spinner while loading", () => {
    render(<DeviceDrawerContent {...baseProps} loading data={null} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows the empty-data warning when there is no device", () => {
    render(<DeviceDrawerContent {...baseProps} data={{ device: null, findings: [] }} />);
    expect(screen.getByText(/No compliance data for this device yet/i)).toBeInTheDocument();
  });

  it("renders the full drawer: header, findings, and bulk toolbar", async () => {
    render(<DeviceDrawerContent {...baseProps} data={deviceData} />);

    // Header uses the device hostname.
    expect(screen.getByRole("heading", { name: "host-a" })).toBeInTheDocument();
    // FindingCard rendered both findings (checkId + title).
    expect(screen.getByText("cis:1.1")).toBeInTheDocument();
    expect(screen.getByText("Check one")).toBeInTheDocument();
    expect(screen.getByText("cis:2.2")).toBeInTheDocument();
    // BulkFindingToolbar rendered (findings.length > 0) — asserts the import resolved.
    expect(screen.getByText("Select all (2 findings)")).toBeInTheDocument();
    // Status counts line from statusCounts memo.
    expect(screen.getByText(/1 pass · 1 fail/)).toBeInTheDocument();
    // FleetRankingLine (eager) fired its fetch with the agent id.
    await waitFor(() => expect(getDeviceFleetRanking).toHaveBeenCalledWith("agent-1"));
  });

  it("wires the close button", () => {
    const onClose = vi.fn();
    render(<DeviceDrawerContent {...baseProps} onClose={onClose} data={deviceData} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selecting all then opening the actions menu shows bulk transitions", async () => {
    render(<DeviceDrawerContent {...baseProps} data={deviceData} />);
    // Select all via the toolbar checkbox, then open the Actions menu.
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all findings" }));
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /actions/i }));
    // Menu (bulk transitions) rendered — asserts Menu/MenuItem/RemediationStatusChip resolved.
    await waitFor(() =>
      expect(screen.getByText(/Revoke acknowledgement/i)).toBeInTheDocument()
    );
  });
});

describe("a failed request is not an empty device", () => {
  // The bug this pins: openDrawer swallowed the detail request's error, so
  // `data` came back null and the drawer rendered "No compliance data for
  // this device yet." A 403 or a 500 on our side was presented to the
  // operator as a confident statement ABOUT THEIR MACHINE — sending them
  // to investigate a device that was fine.

  it("says the load failed, not that the device has no data", () => {
    render(
      <DeviceDrawerContent {...baseProps} data={null} error="HTTP 403: TENANT_NOT_RESOLVED" />
    );
    expect(screen.getByText(/couldn't load this device/i)).toBeInTheDocument();
    expect(screen.getByText(/TENANT_NOT_RESOLVED/)).toBeInTheDocument();
    expect(screen.queryByText(/no compliance data for this device yet/i)).toBeNull();
  });

  it("offers a retry, because these failures are usually transient", () => {
    const onRetry = vi.fn();
    render(<DeviceDrawerContent {...baseProps} data={null} error="boom" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("still reports a genuinely empty device as empty", () => {
    // The old message is correct in its own case — the fix is that it is
    // no longer used for both.
    render(<DeviceDrawerContent {...baseProps} data={null} error={null} />);
    expect(screen.getByText(/no compliance data for this device yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load this device/i)).toBeNull();
  });

  it("renders the detail normally when the request succeeded", () => {
    render(<DeviceDrawerContent {...baseProps} data={deviceData} error={null} />);
    expect(screen.queryByText(/couldn't load this device/i)).toBeNull();
    expect(screen.queryByText(/no compliance data/i)).toBeNull();
  });

  it("shows the error even while an unrelated retry is not in flight", () => {
    // Loading wins over error so a retry does not flash the old failure,
    // but a settled failure must never be silently swallowed by a stale
    // loading flag either.
    const { rerender } = render(
      <DeviceDrawerContent {...baseProps} data={null} error="boom" loading />
    );
    expect(screen.queryByText(/couldn't load this device/i)).toBeNull();
    rerender(<DeviceDrawerContent {...baseProps} data={null} error="boom" loading={false} />);
    expect(screen.getByText(/couldn't load this device/i)).toBeInTheDocument();
  });
});
