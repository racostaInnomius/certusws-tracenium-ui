import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PatchCoverageCard from "./PatchCoverageCard";

afterEach(cleanup);

const posture = (items) => ({ status: "fulfilled", value: { items } });

const recentDevice = { patchSummary: { lastInstalledAtUtc: new Date().toISOString() } };
const staleDevice = {
  patchSummary: { lastInstalledAtUtc: new Date(Date.now() - 200 * 86_400_000).toISOString() }
};

describe("PatchCoverageCard — reconciled against fleetDevices", () => {
  it("shows 'scanned' and the raw item count when fleetDevices is not passed (old behavior)", () => {
    render(
      <PatchCoverageCard result={posture([recentDevice, staleDevice])} loading={false} onNavigate={vi.fn()} />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("scanned")).toBeInTheDocument();
    expect(screen.queryByText(/not scanned yet/i)).not.toBeInTheDocument();
  });

  it("reconciles to fleetDevices and shows the gap as 'Not scanned yet'", () => {
    render(
      <PatchCoverageCard
        result={posture([recentDevice, staleDevice])}
        loading={false}
        onNavigate={vi.fn()}
        fleetDevices={5}
      />
    );
    // 2 scanned, fleetDevices = 5 → pending = 3
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("enrolled")).toBeInTheDocument();
    expect(screen.getByText("Not scanned yet +3")).toBeInTheDocument();
  });

  it("renders a pending-only donut instead of the empty state when nothing has scanned yet but devices are enrolled", () => {
    render(
      <PatchCoverageCard result={posture([])} loading={false} onNavigate={vi.fn()} fleetDevices={4} />
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Not scanned yet +4")).toBeInTheDocument();
    expect(screen.queryByText("No compliance data yet")).not.toBeInTheDocument();
  });

  it("still shows the empty state when there is neither scan data nor a fleet roster", () => {
    render(<PatchCoverageCard result={posture([])} loading={false} onNavigate={vi.fn()} />);
    expect(screen.getByText("No compliance data yet")).toBeInTheDocument();
  });
});
