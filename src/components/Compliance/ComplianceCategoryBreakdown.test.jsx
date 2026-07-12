// src/components/Compliance/ComplianceCategoryBreakdown.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/compliance", () => ({
  getCategorySummary: vi.fn(),
}));
import { getCategorySummary } from "../../api/compliance";
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
});
