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

describe("FindingCard (readOnly / RBAC)", () => {
  function renderReadOnly(overrides = {}) {
    return render(
      <FindingCard
        finding={{ ...baseFinding, ...overrides }}
        onAck={noop}
        onRevoke={noop}
        onChangeStatus={noop}
        onShowHistory={noop}
        pendingAction={null}
        readOnly
      />
    );
  }

  it("hides Acknowledge and Change status for read-only members", () => {
    renderReadOnly();
    expect(screen.queryByText(/Acknowledge/)).toBeNull();
    expect(screen.queryByText("Change status")).toBeNull();
  });

  it("hides Revoke ack even when the finding is acknowledged", () => {
    renderReadOnly({ acknowledgedAt: "2026-08-01T00:00:00Z" });
    expect(screen.queryByText("Revoke ack")).toBeNull();
  });

  it("keeps the read-only History action visible", () => {
    renderReadOnly();
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("still renders mutations when readOnly is false (default)", () => {
    renderCard();
    expect(screen.getByText(/Acknowledge/)).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
  });
});

describe("FindingCard (Sprint 4 — one-click fix)", () => {
  function renderWith(overrides, props = {}) {
    return render(
      <FindingCard
        finding={{ ...baseFinding, ...overrides }}
        onAck={noop}
        onRevoke={noop}
        onChangeStatus={noop}
        onShowHistory={noop}
        pendingAction={null}
        {...props}
      />
    );
  }

  it("shows Fix now only for a failing, agentRemediable finding with a handler", () => {
    const onRemediate = vi.fn();
    renderWith({ status: "fail", agentRemediable: true }, { onRemediate });
    expect(screen.getByText("Fix now")).toBeInTheDocument();
  });

  it("hides Fix now when the crosswalk says no handler exists", () => {
    renderWith({ status: "fail", agentRemediable: false }, { onRemediate: vi.fn() });
    expect(screen.queryByText("Fix now")).toBeNull();
  });

  it("hides Fix now on a passing finding, in read-only mode, and without a handler prop", () => {
    renderWith({ status: "pass", agentRemediable: true }, { onRemediate: vi.fn() });
    expect(screen.queryByText("Fix now")).toBeNull();
    renderWith({ status: "fail", agentRemediable: true }, { onRemediate: vi.fn(), readOnly: true });
    expect(screen.queryByText("Fix now")).toBeNull();
    renderWith({ status: "fail", agentRemediable: true });
    expect(screen.queryByText("Fix now")).toBeNull();
  });

  it("clicking Fix now hands the finding to the handler", () => {
    const onRemediate = vi.fn();
    renderWith({ status: "fail", agentRemediable: true }, { onRemediate });
    screen.getByText("Fix now").click();
    expect(onRemediate).toHaveBeenCalledTimes(1);
    expect(onRemediate.mock.calls[0][0].checkId).toBe(baseFinding.checkId);
  });
});

describe("FindingCard (Sprint 4 — CVE/KEV cross checks)", () => {
  const kevFinding = {
    ...baseFinding,
    checkId: "cross.vulnerability.no_kev",
    status: "fail",
    category: "patching",
  };
  function renderKev(props = {}) {
    return render(
      <FindingCard
        finding={kevFinding}
        onAck={noop}
        onRevoke={noop}
        onChangeStatus={noop}
        onShowHistory={noop}
        pendingAction={null}
        {...props}
      />
    );
  }

  it("names the KEVs from the device block and links to Vulnerabilities", () => {
    const onOpen = vi.fn();
    renderKev({
      onOpenVulnerabilities: onOpen,
      deviceVulnerability: { kev_ids: ["CVE-2026-0001", "CVE-2026-0002"], next_kev_due_date: "2026-09-01" },
    });
    const chip = screen.getByText("2 KEVs · due 2026-09-01");
    chip.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic label when the device block is absent", () => {
    renderKev({ onOpenVulnerabilities: vi.fn() });
    expect(screen.getByText("View vulnerabilities")).toBeInTheDocument();
  });

  it("does not render the chip on non-vulnerability checks or passing ones", () => {
    render(
      <FindingCard finding={{ ...baseFinding, status: "fail" }} onAck={noop} onRevoke={noop}
        onChangeStatus={noop} onShowHistory={noop} pendingAction={null}
        deviceVulnerability={{ kev_ids: ["CVE-X"] }} onOpenVulnerabilities={vi.fn()} />
    );
    expect(screen.queryByText(/KEV/)).toBeNull();
    render(
      <FindingCard finding={{ ...kevFinding, status: "pass" }} onAck={noop} onRevoke={noop}
        onChangeStatus={noop} onShowHistory={noop} pendingAction={null}
        deviceVulnerability={{ kev_ids: ["CVE-X"] }} onOpenVulnerabilities={vi.fn()} />
    );
    expect(screen.queryByText(/KEV/)).toBeNull();
  });
});

describe("FindingCard (Sprint 4 — Explain)", () => {
  it("offers Explain only with canExplain on a failing finding with an id", () => {
    render(
      <FindingCard finding={{ ...baseFinding, status: "fail" }} onAck={noop} onRevoke={noop}
        onChangeStatus={noop} onShowHistory={noop} pendingAction={null} canExplain />
    );
    expect(screen.getByText("Explain")).toBeInTheDocument();
  });
  it("hides Explain without canExplain, and on passing findings", () => {
    renderCard({ status: "fail" });
    expect(screen.queryByText("Explain")).toBeNull();
    render(
      <FindingCard finding={{ ...baseFinding, status: "pass" }} onAck={noop} onRevoke={noop}
        onChangeStatus={noop} onShowHistory={noop} pendingAction={null} canExplain />
    );
    expect(screen.queryByText("Explain")).toBeNull();
  });
});
