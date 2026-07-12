// src/components/Compliance/ComplianceCategoryBreakdown.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";

vi.mock("../../api/compliance", () => ({
  getCategorySummary: vi.fn(),
  getCategoryDevices: vi.fn(),
}));
import { getCategorySummary, getCategoryDevices } from "../../api/compliance";
import ComplianceCategoryBreakdown from "./ComplianceCategoryBreakdown";

const ITEMS = {
  ok: true,
  items: [
    {
      category: "firewall",
      total: 37,
      passed: 2,
      failed: 17,
      errored: 0,
      notApplicable: 18,
      highSeverityFails: 17,
      devices: 15,
      devicesFailing: 15,
      passRate: 11,
    },
    {
      category: "network_sharing",
      total: 34,
      passed: 27,
      failed: 1,
      errored: 0,
      notApplicable: 6,
      highSeverityFails: 1,
      devices: 14,
      devicesFailing: 1,
      passRate: 96,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ComplianceCategoryBreakdown", () => {
  it("renders a row per category with prettified names and pass rates", async () => {
    getCategorySummary.mockResolvedValue(ITEMS);
    render(<ComplianceCategoryBreakdown />);

    expect(await screen.findByText("firewall")).toBeInTheDocument();
    expect(screen.getByText("network sharing")).toBeInTheDocument(); // underscore → space
    expect(screen.getByText("11%")).toBeInTheDocument();
    expect(screen.getByText("96%")).toBeInTheDocument();
  });

  it("shows the empty state when there are no findings", async () => {
    getCategorySummary.mockResolvedValue({ ok: true, items: [] });
    render(<ComplianceCategoryBreakdown />);
    expect(await screen.findByText(/No compliance findings reported yet/i)).toBeInTheDocument();
  });

  it("surfaces a load error", async () => {
    getCategorySummary.mockRejectedValue({ body: { message: "boom" } });
    render(<ComplianceCategoryBreakdown />);
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });

  it("drills into a failing category to show the failing devices + checks", async () => {
    getCategorySummary.mockResolvedValue(ITEMS);
    getCategoryDevices.mockResolvedValue({
      ok: true,
      category: "firewall",
      items: [
        {
          agentId: "a1",
          hostname: "W11-Lab01",
          platform: "windows",
          failingChecks: 2,
          highSeverityFails: 2,
          checks: [
            { checkId: "windows.firewall.domain", title: "Domain firewall on", severity: "high" },
            { checkId: "windows.firewall.public", title: "Public firewall on", severity: "high" },
          ],
        },
      ],
    });
    render(<ComplianceCategoryBreakdown />);
    const firewallCell = await screen.findByText("firewall");
    const row = firewallCell.closest("tr");
    // Expand the firewall row (it has failures → expandable).
    fireEvent.click(within(row).getByRole("button"));

    expect(await screen.findByText("W11-Lab01")).toBeInTheDocument();
    expect(screen.getByText("Domain firewall on")).toBeInTheDocument();
    expect(screen.getByText(/1 device failing this category/)).toBeInTheDocument();
    expect(getCategoryDevices).toHaveBeenCalledWith("firewall");
  });

  it("does not fetch drill-in devices until a category is expanded", async () => {
    getCategorySummary.mockResolvedValue(ITEMS);
    render(<ComplianceCategoryBreakdown />);
    await screen.findByText("firewall");
    expect(getCategoryDevices).not.toHaveBeenCalled();
  });
});
