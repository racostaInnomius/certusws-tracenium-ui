import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PatchCoverageCard from "./PatchCoverageCard";

afterEach(cleanup);

// recharts' ResponsiveContainer measures its container via
// ResizeObserver (unimplemented in jsdom) and getBoundingClientRect
// (jsdom always returns 0x0). Without a stub the chart area stays sized
// 0x0 and never renders its SVG — including the center total/label —
// so every donut test below would silently see nothing. Scoped to this
// file only, restored after.
let originalGetBoundingClientRect;
let originalResizeObserver;
beforeAll(() => {
  originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  originalResizeObserver = global.ResizeObserver;
  Element.prototype.getBoundingClientRect = () => ({
    width: 200, height: 200, top: 0, left: 0, bottom: 200, right: 200, x: 0, y: 0, toJSON() {}
  });
  global.ResizeObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(target) { this.cb([{ target, contentRect: { width: 200, height: 200 } }]); }
    unobserve() {}
    disconnect() {}
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  global.ResizeObserver = originalResizeObserver;
});

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
    expect(screen.getByText("Not scanned yet")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("renders a pending-only donut instead of the empty state when nothing has scanned yet but devices are enrolled", () => {
    render(
      <PatchCoverageCard result={posture([])} loading={false} onNavigate={vi.fn()} fleetDevices={4} />
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Not scanned yet")).toBeInTheDocument();
    expect(screen.queryByText("No compliance data yet")).not.toBeInTheDocument();
  });

  it("still shows the empty state when there is neither scan data nor a fleet roster", () => {
    render(<PatchCoverageCard result={posture([])} loading={false} onNavigate={vi.fn()} />);
    expect(screen.getByText("No compliance data yet")).toBeInTheDocument();
  });
});
