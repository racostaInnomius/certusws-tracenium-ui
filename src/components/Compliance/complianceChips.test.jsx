import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  SeverityChip,
  FrameworkChip,
  ScoreBar,
  Sparkline,
  StatusChip,
  RemediationStatusChip,
} from "./complianceChips";

afterEach(cleanup);

describe("StatusChip", () => {
  it("labels each rule outcome and falls back to Unknown", () => {
    render(<StatusChip status="pass" />);
    expect(screen.getByText("Pass")).toBeInTheDocument();
    cleanup();
    render(<StatusChip status="insufficient_data" />);
    expect(screen.getByText("No data")).toBeInTheDocument(); // distinct from Unknown
    cleanup();
    render(<StatusChip status="something-else" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument(); // fallback
  });
});

describe("RemediationStatusChip", () => {
  it("labels operator states and falls back to Open", () => {
    render(<RemediationStatusChip status="in_progress" />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
    cleanup();
    render(<RemediationStatusChip status="wont_fix" />);
    expect(screen.getByText("Won't fix")).toBeInTheDocument();
    cleanup();
    render(<RemediationStatusChip status="bogus" />);
    expect(screen.getByText("Open")).toBeInTheDocument(); // fallback
  });
});

describe("SeverityChip", () => {
  it("labels each known severity and falls back to Medium for unknown", () => {
    render(<SeverityChip severity="critical" />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    cleanup();
    render(<SeverityChip severity="high" />);
    expect(screen.getByText("High")).toBeInTheDocument();
    cleanup();
    render(<SeverityChip severity="not-a-severity" />);
    expect(screen.getByText("Medium")).toBeInTheDocument(); // fallback
  });
});

describe("FrameworkChip", () => {
  it("abbreviates the framework family", () => {
    render(<FrameworkChip framework="cis_v8" controlId="9.3.1" />);
    expect(screen.getByText("CIS 9.3.1")).toBeInTheDocument();
    cleanup();
    render(<FrameworkChip framework="nist_800_53" controlId="SC-7(5)" />);
    expect(screen.getByText("NIST SC-7(5)")).toBeInTheDocument();
    cleanup();
    render(<FrameworkChip framework="nist_csf_2" controlId="PR.IR-01" />);
    expect(screen.getByText("CSF PR.IR-01")).toBeInTheDocument();
  });

  it("suffixes the control level ONLY for CIS and STIG", () => {
    render(<FrameworkChip framework="cis_v8" controlId="9.3.1" controlLevel="L1" />);
    expect(screen.getByText("CIS 9.3.1 · L1")).toBeInTheDocument();
    cleanup();
    render(<FrameworkChip framework="stig_w11" controlId="V-253000" controlLevel="CAT I" />);
    expect(screen.getByText("STIG V-253000 · CAT I")).toBeInTheDocument();
    cleanup();
    // NIST/CSF control levels are noise → NOT suffixed
    render(<FrameworkChip framework="nist_800_53" controlId="SC-7" controlLevel="baseline" />);
    expect(screen.getByText("NIST SC-7")).toBeInTheDocument();
  });
});

describe("ScoreBar", () => {
  it("renders 'no data' for null/undefined (not a red 0% bar)", () => {
    render(<ScoreBar value={null} />);
    expect(screen.getByText("no data")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
  it("renders an explicit 0 as a bar", () => {
    render(<ScoreBar value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
  it("clamps and renders a numeric score", () => {
    render(<ScoreBar value={150} />);
    expect(screen.getByText("100")).toBeInTheDocument(); // clamped
  });
});

describe("Sparkline", () => {
  it("returns null for empty input", () => {
    const { container } = render(<Sparkline points={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });
  it("draws a path with one command per point", () => {
    const { container } = render(<Sparkline points={[10, 50, 90]} />);
    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    const d = path.getAttribute("d");
    expect(d.startsWith("M")).toBe(true);
    expect((d.match(/L/g) || []).length).toBe(2); // 3 points → M + 2 L
  });
});
