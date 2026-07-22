import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

// Mock the API module before importing the component.
vi.mock("../../api/compliance", () => ({
  getDeviceFleetRanking: vi.fn(),
}));
import { getDeviceFleetRanking } from "../../api/compliance";
import FleetRankingLine from "./FleetRankingLine";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("FleetRankingLine", () => {
  it("does not fetch without an agentId", () => {
    render(<FleetRankingLine agentId={null} />);
    expect(getDeviceFleetRanking).not.toHaveBeenCalled();
  });

  it("renders the rank line for a scored device", async () => {
    getDeviceFleetRanking.mockResolvedValue({
      ok: true,
      ranking: { rank: 12, scoredCount: 40, unscoredCount: 5, topPercentile: 27 },
    });
    render(<FleetRankingLine agentId="agent-1" />);

    await waitFor(() => expect(getDeviceFleetRanking).toHaveBeenCalledWith("agent-1"));
    expect(await screen.findByText(/#12 of 40 scored · top 27%/)).toBeInTheDocument();
  });

  it("explains an unscored device instead of showing a rank", async () => {
    getDeviceFleetRanking.mockResolvedValue({
      ok: true,
      ranking: { rank: null, scoredCount: 33, unscoredCount: 12, topPercentile: null },
    });
    render(<FleetRankingLine agentId="agent-1" />);
    // fleetSize = 33 + 12 = 45
    expect(await screen.findByText(/Not scored · 33 of 45 devices scored/)).toBeInTheDocument();
  });

  it("uses the lone-device message when it is the only scored device", async () => {
    getDeviceFleetRanking.mockResolvedValue({
      ok: true,
      ranking: { rank: 1, scoredCount: 1, unscoredCount: 4, topPercentile: 100 },
    });
    render(<FleetRankingLine agentId="agent-1" />);
    expect(await screen.findByText(/Only scored device in this fleet/)).toBeInTheDocument();
  });

  it("renders nothing when the ranking request fails", async () => {
    getDeviceFleetRanking.mockRejectedValue(new Error("boom"));
    const { container } = render(<FleetRankingLine agentId="agent-1" />);
    await waitFor(() => expect(getDeviceFleetRanking).toHaveBeenCalled());
    // Silent failure — no rank line rendered.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
