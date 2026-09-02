// src/components/Compliance/MttrCard.test.jsx
//
// First coverage for the MTTR card (314 lines, zero tests until Sprint
// 2 item 5). Pins: fixed severity rows render even when the API omits
// buckets, values land in the right rows, the error path surfaces, and
// the Sprint-2 reloadKey prop actually triggers a refetch.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const getTimeToCloseSummary = vi.fn();
vi.mock("../../api/compliance", () => ({
  getTimeToCloseSummary: (...args) => getTimeToCloseSummary(...args),
}));

import MttrCard from "./MttrCard";

beforeEach(() => {
  getTimeToCloseSummary.mockReset();
});

// This suite has no auto-cleanup (the project's vitest setup does not
// enable globals), so renders piled up across tests and any query that
// is not unique to one case matched several cards at once.
afterEach(cleanup);

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

  // 2026-09-01 — the card is named for what the endpoint now measures
  // (green closures only), and reports the sub-cycle closures the
  // backend discarded. That footnote is the only place flapping checks
  // are visible to an operator, so it is worth pinning.
  it("is titled for remediation, not for closure", async () => {
    getTimeToCloseSummary.mockResolvedValue(okResponse([]));
    render(<MttrCard />);
    await waitFor(() => expect(screen.getByText("Time to remediate")).toBeInTheDocument());
    expect(screen.queryByText("Average time to fix")).not.toBeInTheDocument();
  });

  it("reports the sub-cycle closures the backend excluded", async () => {
    getTimeToCloseSummary.mockResolvedValue(
      okResponse([
        { severity: "high", sampleSize: 148, churnExcluded: 196, medianDays: 2.81, p90Days: 22.6 },
        { severity: "medium", sampleSize: 129, churnExcluded: 197, medianDays: 2.14, p90Days: 19.5 },
      ])
    );
    render(<MttrCard />);
    // Summed across severities, not per row.
    await waitFor(() =>
      expect(screen.getByText(/393 short-lived closures excluded/)).toBeInTheDocument()
    );
  });

  it("stays silent about churn when there is none", async () => {
    getTimeToCloseSummary.mockResolvedValue(
      okResponse([{ severity: "high", sampleSize: 12, churnExcluded: 0, medianDays: 3, p90Days: 8 }])
    );
    render(<MttrCard />);
    await waitFor(() => expect(screen.getByText("High")).toBeInTheDocument());
    expect(screen.queryByText(/short-lived/)).not.toBeInTheDocument();
  });

  it("refetches when reloadKey changes (unified refresh, Sprint 2 item 4)", async () => {
    getTimeToCloseSummary.mockResolvedValue(okResponse([]));
    const { rerender } = render(<MttrCard reloadKey={0} />);
    await waitFor(() => expect(getTimeToCloseSummary).toHaveBeenCalledTimes(1));
    rerender(<MttrCard reloadKey={1} />);
    await waitFor(() => expect(getTimeToCloseSummary).toHaveBeenCalledTimes(2));
  });
});
