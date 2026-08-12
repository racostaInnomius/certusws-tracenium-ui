import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import FindingCard from "./FindingCard";

afterEach(cleanup);

const baseFinding = {
  id: "f-1",
  title: "SSH root login is permitted",
  severity: "high",
  status: "fail",
  remediationStatus: "open",
  description: "PermitRootLogin should be 'no'.",
  remediationSummary: "Set PermitRootLogin no in sshd_config.",
  evidence: "PermitRootLogin yes",
  checkId: "ssh-root-login",
  firstSeenAtUtc: "2026-05-01T00:00:00.000Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
  acknowledgedUntil: null,
  acknowledgementExpired: false,
  frameworks: [
    { framework: "cis_v8", control_id: "5.2.4", control_level: "L1", control_title: "Ensure SSH root login is disabled" },
    { framework: "stig_w11", control_id: "V-253000", control_level: "CAT I" },
  ],
};

const noop = () => {};

function renderCard(overrides = {}) {
  return render(
    <FindingCard
      finding={{ ...baseFinding, ...overrides }}
      onAck={noop}
      onRevoke={noop}
      onChangeStatus={noop}
      onShowHistory={noop}
      pendingAction={null}
    />
  );
}

describe("FindingCard (render smoke)", () => {
  it("renders the title, severity and status without crashing", () => {
    renderCard();
    expect(screen.getByText("SSH root login is permitted")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument(); // SeverityChip
    expect(screen.getByText("Fail")).toBeInTheDocument(); // StatusChip
  });

  it("renders a framework chip per mapping, with CIS/STIG control levels", () => {
    renderCard();
    expect(screen.getByText("CIS 5.2.4 · L1")).toBeInTheDocument();
    expect(screen.getByText("STIG V-253000 · CAT I")).toBeInTheDocument();
  });

  it("shows the remediation status", () => {
    renderCard({ remediationStatus: "in_progress" });
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("hides the selection checkbox when onToggleSelected is null", () => {
    const { container } = renderCard();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("shows the selection checkbox when a toggle handler is provided", () => {
    render(
      <FindingCard
        finding={baseFinding}
        onAck={noop}
        onRevoke={noop}
        onChangeStatus={noop}
        onShowHistory={noop}
        pendingAction={null}
        onToggleSelected={vi.fn()}
      />
    );
    expect(document.querySelector('input[type="checkbox"]')).not.toBeNull();
  });
});
