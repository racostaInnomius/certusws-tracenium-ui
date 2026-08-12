import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

// Mock the API module before importing the component.
vi.mock("../../api/compliance", () => ({
  getFindingHistory: vi.fn(),
}));
import { getFindingHistory } from "../../api/compliance";
import FindingHistoryDialog from "./FindingHistoryDialog";

const finding = { id: 42, checkId: "cis_v8:9.3.1" };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("FindingHistoryDialog", () => {
  it("fetches on open and renders the humanized event list", async () => {
    getFindingHistory.mockResolvedValue({
      ok: true,
      events: [
        { id: 1, eventType: "remediation_status_changed", atUtc: "2026-05-26T10:00:00Z", actorUserId: "alice", note: "did the thing" },
      ],
    });
    render(<FindingHistoryDialog open finding={finding} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("Remediation status changed")).toBeInTheDocument());
    expect(getFindingHistory).toHaveBeenCalledWith(42, { limit: 200 });
    expect(screen.getByText(/by alice/)).toBeInTheDocument();
    expect(screen.getByText(/did the thing/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no events", async () => {
    getFindingHistory.mockResolvedValue({ ok: true, events: [] });
    render(<FindingHistoryDialog open finding={finding} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No events recorded yet/i)).toBeInTheDocument());
  });

  it("surfaces an error when the fetch fails", async () => {
    getFindingHistory.mockResolvedValue({ ok: false, message: "boom" });
    render(<FindingHistoryDialog open finding={finding} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });

  it("does not fetch while closed", () => {
    render(<FindingHistoryDialog open={false} finding={finding} onClose={() => {}} />);
    expect(getFindingHistory).not.toHaveBeenCalled();
  });
});
