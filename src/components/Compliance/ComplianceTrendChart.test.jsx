// src/components/Compliance/ComplianceTrendChart.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../api/compliance", () => ({
  getFleetComplianceTimeseries: vi.fn(),
  getFrameworkComplianceTimeseries: vi.fn(),
}));
import { getFleetComplianceTimeseries, getFrameworkComplianceTimeseries } from "../../api/compliance";
import ComplianceTrendChart from "./ComplianceTrendChart";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const twoDays = {
  windowDays: 30,
  buckets: [
    { bucket: "2026-06-01", avgScore: 70, devicesScored: 10, compliant: 7, nonCompliant: 3 },
    { bucket: "2026-06-30", avgScore: 82, devicesScored: 10, compliant: 9, nonCompliant: 1 },
  ],
};

describe("ComplianceTrendChart", () => {
  it("shows the first→last score delta", async () => {
    getFleetComplianceTimeseries.mockResolvedValue(twoDays);
    render(<ComplianceTrendChart />);
    expect(await screen.findByText(/\+12 pts · now 82\/100/)).toBeInTheDocument();
    expect(getFleetComplianceTimeseries).toHaveBeenCalledWith(30); // default window
  });

  it("re-fetches with the selected window", async () => {
    getFleetComplianceTimeseries.mockResolvedValue(twoDays);
    const user = userEvent.setup();
    render(<ComplianceTrendChart />);
    await screen.findByText(/pts · now/);

    await user.click(screen.getByRole("button", { name: "90d" }));
    await waitFor(() => expect(getFleetComplianceTimeseries).toHaveBeenCalledWith(90));
  });

  it("shows an empty state with no snapshots", async () => {
    getFleetComplianceTimeseries.mockResolvedValue({ buckets: [] });
    render(<ComplianceTrendChart />);
    expect(await screen.findByText(/No compliance snapshots yet/i)).toBeInTheDocument();
  });

  it("surfaces a load error via notify", async () => {
    getFleetComplianceTimeseries.mockRejectedValue({ body: { message: "boom" } });
    const notify = vi.fn();
    render(<ComplianceTrendChart notify={notify} />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", "boom"));
  });

  it("switches to the framework view and fetches the per-framework series", async () => {
    getFleetComplianceTimeseries.mockResolvedValue(twoDays);
    getFrameworkComplianceTimeseries.mockResolvedValue({
      windowDays: 30,
      frameworks: ["cis_windows_11_v3.0", "nist_csf_2.0"],
      buckets: [
        { bucket: "2026-07-01", scores: { "cis_windows_11_v3.0": 70, "nist_csf_2.0": 75 } },
        { bucket: "2026-07-02", scores: { "cis_windows_11_v3.0": 78, "nist_csf_2.0": 80 } },
      ],
    });
    const user = userEvent.setup();
    render(<ComplianceTrendChart />);
    await screen.findByText(/pts · now/); // score view loaded first

    await user.click(screen.getByRole("button", { name: "By framework" }));
    await waitFor(() => expect(getFrameworkComplianceTimeseries).toHaveBeenCalledWith(30));
    // No per-framework empty state shown → the series rendered.
    expect(screen.queryByText(/No per-framework data yet/i)).not.toBeInTheDocument();
  });

  it("shows a per-framework empty state before any data is recorded", async () => {
    getFleetComplianceTimeseries.mockResolvedValue(twoDays);
    getFrameworkComplianceTimeseries.mockResolvedValue({ frameworks: [], buckets: [] });
    const user = userEvent.setup();
    render(<ComplianceTrendChart />);
    await screen.findByText(/pts · now/);
    await user.click(screen.getByRole("button", { name: "By framework" }));
    expect(await screen.findByText(/No per-framework data yet/i)).toBeInTheDocument();
  });
});
