// Branch coverage for the loading / error / empty / content states of the
// per-plugin drilldown dialog, which were folded into <AsyncState>. The
// component had no tests before this migration, so these pin the four
// observable outcomes.
//
// Contract note: the strip does NOT fetch its own summary — the parent passes
// a Promise.allSettled `result`; only the drilldown hits the API.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../api/overview", () => ({
  getPluginCoverageDevices: vi.fn(),
}));

import { getPluginCoverageDevices } from "../../api/overview";
import PluginCoverageStrip from "./PluginCoverageStrip";

const result = {
  status: "fulfilled",
  value: { total: 2, byPlugin: [{ plugin: "amp", count: 1 }] },
};

/** Click the AMP row to open the drilldown dialog. */
function openDrill() {
  fireEvent.click(screen.getByText("AMP · Inventory"));
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("PluginCoverageStrip drilldown states", () => {
  it("renders a row per known plugin from the passed-in result", () => {
    render(<PluginCoverageStrip result={result} loading={false} />);
    expect(screen.getByText("AMP · Inventory")).toBeInTheDocument();
  });

  it("shows the empty state when the plugin has no missing devices", async () => {
    getPluginCoverageDevices.mockResolvedValue({ covered: [], missing: [], total: 0, coveredCount: 0 });
    render(<PluginCoverageStrip result={result} loading={false} />);
    openDrill();
    // Tab 0 = "missing" → the celebratory empty copy.
    await waitFor(() =>
      expect(screen.getByText(/No devices missing this plugin/i)).toBeInTheDocument()
    );
  });

  it("lists the missing devices when the fetch returns some", async () => {
    getPluginCoverageDevices.mockResolvedValue({
      covered: [],
      missing: [{ agentId: "a1", hostname: "host-1" }],
      total: 1,
      coveredCount: 0,
    });
    render(<PluginCoverageStrip result={result} loading={false} />);
    openDrill();
    await waitFor(() => expect(screen.getByText("host-1")).toBeInTheDocument());
  });

  it("surfaces a fetch error instead of the list", async () => {
    getPluginCoverageDevices.mockRejectedValue(new Error("coverage boom"));
    render(<PluginCoverageStrip result={result} loading={false} />);
    openDrill();
    await waitFor(() => expect(screen.getByText(/coverage boom/i)).toBeInTheDocument());
  });
});
