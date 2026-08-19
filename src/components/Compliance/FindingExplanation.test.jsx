// src/components/Compliance/FindingExplanation.test.jsx
//
// The AI explanation panel (Sprint 4). Pins: renders the structured
// fields, maps the backend's typed errors to operator-readable reasons,
// and Regenerate re-requests with refresh.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

const explainFinding = vi.fn();
vi.mock("../../api/compliance", () => ({
  explainFinding: (...a) => explainFinding(...a),
}));

import FindingExplanation from "./FindingExplanation";

afterEach(() => {
  cleanup();
  explainFinding.mockReset();
});

const payload = {
  ok: true,
  cached: false,
  model: "claude-test",
  basedOn: { checkId: "x", platform: "windows", osRelease: "10.0.22631", frameworkRefs: ["CIS 9.1.1"] },
  explanation: {
    whatItMeans: "The domain firewall profile is off.",
    whyItMatters: "Unfiltered inbound traffic; CIS 9.1.1.",
    remediationSteps: ["Open GPO", "Set firewall state On", "gpupdate /force"],
    riskIfIgnored: "Lateral movement.",
    confidence: "high",
    caveats: null,
  },
};

describe("FindingExplanation", () => {
  it("renders the structured explanation", async () => {
    explainFinding.mockImplementation(async () => payload);
    render(<FindingExplanation findingId={42} />);
    await waitFor(() => expect(screen.getByText("The domain firewall profile is off.")).toBeInTheDocument());
    expect(screen.getByText("gpupdate /force")).toBeInTheDocument();
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.getByText("Based on: CIS 9.1.1")).toBeInTheDocument();
    expect(explainFinding).toHaveBeenCalledWith(42, { refresh: false });
  });

  it("maps 429 to an 'AI not enabled / budget' message", async () => {
    explainFinding.mockImplementation(async () => {
      throw Object.assign(new Error("quota"), { status: 429, body: { error: "AI_QUOTA_EXCEEDED" } });
    });
    render(<FindingExplanation findingId={42} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/not enabled for this tenant/);
  });

  it("Regenerate re-requests with refresh:true", async () => {
    explainFinding.mockImplementation(async () => payload);
    render(<FindingExplanation findingId={42} />);
    await waitFor(() => expect(screen.getByText("Regenerate")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Regenerate"));
    await waitFor(() => expect(explainFinding).toHaveBeenCalledTimes(2));
    expect(explainFinding.mock.calls[1]).toEqual([42, { refresh: true }]);
  });
});
