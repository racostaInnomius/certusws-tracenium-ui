// src/components/software-delivery/IntakeProposalBanner.test.jsx

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import IntakeProposalBanner from "./IntakeProposalBanner";

afterEach(cleanup);

describe("IntakeProposalBanner", () => {
  it("shows the AI confidence badge and notes", () => {
    render(
      <IntakeProposalBanner
        intake={{ proposedConfig: { confidence: "low", notes: "NSIS installer — verify /S is silent." } }}
      />
    );
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByText(/NSIS installer/)).toBeInTheDocument();
  });

  it("renders the confidence badge even with no notes", () => {
    render(<IntakeProposalBanner intake={{ proposedConfig: { confidence: "high", notes: null } }} />);
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.queryByText(/Notes:/)).toBeNull();
  });

  it("renders nothing when there is no proposal (blocked / AI-failed intake)", () => {
    const { container } = render(<IntakeProposalBanner intake={{ proposedConfig: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
