// src/components/Compliance/MttrCard.test.jsx
//
// First coverage for the MTTR card (314 lines, zero tests until Sprint
// 2 item 5). Pins: fixed severity rows render even when the API omits
// buckets, values land in the right rows, the error path surfaces, and
// the Sprint-2 reloadKey prop actually triggers a refetch.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getTimeToCloseSummary = vi.fn();
vi.mock("../../api/compliance", () => ({
  getTimeToCloseSummary: (...args) => getTimeToCloseSummary(...args),
}));

import MttrCard from "./MttrCard";

beforeEach(() => {
  getTimeToCloseSummary.mockReset();
});

function okResponse(bySeverity) {
  return { ok: true, summary: { windowDays: 90, bySeverity } };
}

describe("MttrCard", () => {
  it("renders the fixed severity rows, filling absent buckets with empty rows", async () => {
    getTimeToCloseSummary.mockResolvedValue(
      okResponse([
        { severity: "critical", sampleSize: 4, medianDays: 2.5, p90Days: 9.1 },
      ])
    );
    render(<MttrCard />);
    await waitFor(() => expect(screen.getByText("Critical")).toBeInTheDocument());
    // Fixed buckets render even without data (the "no closures" case
    // must not collapse the card).
    for (const label of ["Critical", "High", "Medium", "Low"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // fmtDays rounds to whole days with a 'd' suffix: 2.5 → "3d",
    // 9.1 → "9d".
    expect(screen.getByText("3d")).toBeInTheDocument();
    expect(screen.getByText("9d")).toBeInTheDocument();
  });

  it("surfaces the API error instead of rendering zeros", async () => {
    getTimeToCloseSummary.mockRejectedValue(new Error("boom mttr"));
    render(<MttrCard />);
    await waitFor(() => expect(screen.getByText(/boom mttr/)).toBeInTheDocument());
  });

  it("refetches when reloadKey changes (unified refresh, Sprint 2 item 4)", async () => {
    getTimeToCloseSummary.mockResolvedValue(okResponse([]));
    const { rerender } = render(<MttrCard reloadKey={0} />);
    await waitFor(() => expect(getTimeToCloseSummary).toHaveBeenCalledTimes(1));
    rerender(<MttrCard reloadKey={1} />);
    await waitFor(() => expect(getTimeToCloseSummary).toHaveBeenCalledTimes(2));
  });
});
