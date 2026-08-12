import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import GroupCoverageNotice from "./GroupCoverageNotice";

afterEach(cleanup);

const fullCoverage = { totalDevices: 40, groupedDevices: 40, ungroupedDevices: 0, coveragePercent: 100 };
const partialCoverage = { totalDevices: 40, groupedDevices: 30, ungroupedDevices: 10, coveragePercent: 75 };

describe("GroupCoverageNotice", () => {
  it("renders the error state with a Retry action", () => {
    const onRefresh = vi.fn();
    render(<GroupCoverageNotice coverage={null} loading={false} error="boom" onRefresh={onRefresh} />);
    expect(screen.getByText(/Group coverage could not be loaded/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("full coverage: reassuring message, no View devices button", () => {
    render(<GroupCoverageNotice coverage={fullCoverage} loading={false} error="" onViewUngrouped={() => {}} />);
    expect(screen.getByText(/All known devices are assigned/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view devices/i })).not.toBeInTheDocument();
    // Coverage chips.
    expect(screen.getByText("100% covered")).toBeInTheDocument();
    expect(screen.getByText("40 grouped")).toBeInTheDocument();
    expect(screen.getByText("40 total")).toBeInTheDocument();
  });

  it("partial coverage: counts the ungrouped devices and wires View devices", () => {
    const onViewUngrouped = vi.fn();
    render(
      <GroupCoverageNotice coverage={partialCoverage} loading={false} error="" onViewUngrouped={onViewUngrouped} />
    );
    expect(screen.getByText(/10 devices not assigned to any group/i)).toBeInTheDocument();
    expect(screen.getByText("75% covered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view devices/i }));
    expect(onViewUngrouped).toHaveBeenCalledTimes(1);
  });

  it("loading: shows the checking message", () => {
    render(<GroupCoverageNotice coverage={partialCoverage} loading error="" onViewUngrouped={() => {}} />);
    expect(screen.getByText(/Checking group coverage/i)).toBeInTheDocument();
  });

  it("singular phrasing for exactly one ungrouped device", () => {
    render(
      <GroupCoverageNotice
        coverage={{ totalDevices: 5, groupedDevices: 4, ungroupedDevices: 1, coveragePercent: 80 }}
        loading={false}
        error=""
        onViewUngrouped={() => {}}
      />
    );
    expect(screen.getByText(/1 device not assigned to any group/i)).toBeInTheDocument();
  });
});
