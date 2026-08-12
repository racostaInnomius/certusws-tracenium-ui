import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Mock the API module before importing the component.
vi.mock("../../api/compliance", () => ({
  getDeviceFindingsDiff: vi.fn(),
}));
import { getDeviceFindingsDiff } from "../../api/compliance";
import DeviceDiffSection from "./DeviceDiffSection";

const diffResponse = {
  ok: true,
  diff: {
    currentSnapshotAt: "2026-05-26T10:00:00Z",
    referenceSnapshotAt: "2026-05-20T10:00:00Z",
    added: [{ checkId: "cis_v8:1.1.1", severity: "high", title: "New thing" }],
    removed: [{ checkId: "cis_v8:2.2.2", severity: "low", title: "Old thing" }],
    severityChanged: [{ checkId: "cis_v8:3.3.3", before: "low", after: "high" }],
    statusChanged: [{ checkId: "cis_v8:4.4.4", before: "open", after: "acknowledged" }],
  },
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("DeviceDiffSection", () => {
  it("does not fetch until expanded (lazy)", () => {
    getDeviceFindingsDiff.mockResolvedValue(diffResponse);
    render(<DeviceDiffSection agentId="agent-1" />);
    expect(screen.getByText("Changes since last scan")).toBeInTheDocument();
    expect(getDeviceFindingsDiff).not.toHaveBeenCalled();
  });

  it("fetches on first expand and renders the diff buckets", async () => {
    getDeviceFindingsDiff.mockResolvedValue(diffResponse);
    render(<DeviceDiffSection agentId="agent-1" />);

    fireEvent.click(screen.getByText("Changes since last scan"));

    await waitFor(() =>
      expect(getDeviceFindingsDiff).toHaveBeenCalledWith("agent-1", {})
    );
    // Bucket headers include a count suffix, e.g. "New findings (1)".
    expect(await screen.findByText(/New findings \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Resolved \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Severity changed \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Status changed \(1\)/)).toBeInTheDocument();
    // A representative line from a bucket.
    expect(screen.getByText(/cis_v8:3\.3\.3: low → high/)).toBeInTheDocument();
  });

  it("shows the empty state when there is no reference snapshot", async () => {
    getDeviceFindingsDiff.mockResolvedValue({ ok: true, diff: { referenceSnapshotAt: null } });
    render(<DeviceDiffSection agentId="agent-1" />);
    fireEvent.click(screen.getByText("Changes since last scan"));
    await waitFor(() =>
      expect(screen.getByText(/No prior scan to compare against/i)).toBeInTheDocument()
    );
  });

  it("surfaces an error when the fetch fails", async () => {
    getDeviceFindingsDiff.mockResolvedValue({ ok: false, message: "diff boom" });
    render(<DeviceDiffSection agentId="agent-1" />);
    fireEvent.click(screen.getByText("Changes since last scan"));
    await waitFor(() => expect(screen.getByText("diff boom")).toBeInTheDocument());
  });
});
