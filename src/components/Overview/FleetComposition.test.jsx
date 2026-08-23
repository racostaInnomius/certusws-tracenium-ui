import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import FleetComposition, { AgentVersionDonut, DonutCard } from "./FleetComposition";

// This project does not run vitest with `globals: true`, so RTL's
// auto-cleanup never registers and rendered trees pile up in document.body
// between tests. Explicit teardown keeps screen queries honest.
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

const fulfilled = (value) => ({ status: "fulfilled", value });

describe("DonutCard — pending bucket reconciliation", () => {
  const data = [
    { name: "A", value: 6, color: "#111" },
    { name: "B", value: 2, color: "#222" }
  ];

  it("adds a pending segment and reconciles the total when pendingValue is set", () => {
    render(
      <DonutCard
        title="Widget"
        data={data}
        loading={false}
        totalLabel="enrolled"
        pendingValue={3}
        pendingLabel="Not connected"
      />
    );
    // 6 + 2 known + 3 pending = 11
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("enrolled")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("falls back to the donut's own total when pendingValue is null (no roster to reconcile against)", () => {
    render(
      <DonutCard title="Widget" data={data} loading={false} totalLabel="checked in" pendingValue={null} />
    );
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("checked in")).toBeInTheDocument();
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
  });

  it("omits the pending segment when pendingValue is 0 (already fully reconciled)", () => {
    render(
      <DonutCard title="Widget" data={data} loading={false} totalLabel="enrolled" pendingValue={0} />
    );
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
  });

  it("renders a pending-only donut when there is no per-segment data yet but pendingValue is set", () => {
    // e.g. a tenant that just enrolled devices but nothing has reported in.
    render(
      <DonutCard
        title="Widget"
        data={[]}
        loading={false}
        totalLabel="enrolled"
        fallbackLabel="No data yet"
        pendingValue={3}
        pendingLabel="Not connected"
      />
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.queryByText("No data yet")).not.toBeInTheDocument();
  });

  it("clicking the pending legend row does not call onSegmentClick (no drilldown filter exists for it)", async () => {
    const onSegmentClick = vi.fn();
    render(
      <DonutCard
        title="Widget"
        data={data}
        loading={false}
        pendingValue={3}
        pendingLabel="Not connected"
        onSegmentClick={onSegmentClick}
      />
    );
    screen.getByText("Not connected").closest("div")?.click();
    expect(onSegmentClick).not.toHaveBeenCalled();
  });
});

describe("AgentVersionDonut — reconciled against fleetDevices", () => {
  const byVersion = [{ version: "1.2.0", count: 7 }];

  it("shows 'enrolled' with a 'Not connected' pending row once fleetDevices is known", () => {
    render(
      <AgentVersionDonut
        byVersion={byVersion}
        latestMap={{}}
        loading={false}
        fleetDevices={10}
        agentTotal={7}
      />
    );
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("enrolled")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("keeps the old 'checked in' label and total when fleetDevices is unavailable", () => {
    render(<AgentVersionDonut byVersion={byVersion} latestMap={{}} loading={false} />);
    expect(screen.getByText("checked in")).toBeInTheDocument();
    expect(screen.queryByText(/not connected/i)).not.toBeInTheDocument();
  });
});

describe("FleetComposition — OS platform donut reconciliation", () => {
  it("reconciles the OS platform total to fleetDevices and shows the gap as pending", () => {
    const results = {
      dashboardSummary: fulfilled({
        fleetDevices: 30,
        osPlatform: [
          { os_platform: "Windows", host_count: 20 },
          { os_platform: "Linux", host_count: 7 }
        ]
      }),
      agentVersions: fulfilled({ total: 0, byVersion: [] })
    };

    render(<FleetComposition results={results} loading={false} onNavigate={vi.fn()} />);

    // 20 + 7 known = 27, fleetDevices = 30 → pending = 3. (Agent
    // versions donut also reconciles to 30 here — its own byVersion is
    // empty — so "30" legitimately appears twice.)
    expect(screen.getAllByText("30").length).toBeGreaterThan(0);
    expect(screen.getAllByText("enrolled").length).toBeGreaterThan(0);
    expect(screen.getByText("Pending inventory")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("does not reconcile (old behavior) when the backend predates fleetDevices", () => {
    const results = {
      dashboardSummary: fulfilled({
        osPlatform: [{ os_platform: "Windows", host_count: 20 }]
      }),
      agentVersions: fulfilled({ total: 0, byVersion: [] })
    };

    render(<FleetComposition results={results} loading={false} onNavigate={vi.fn()} />);

    expect(screen.getByText("reporting")).toBeInTheDocument();
    expect(screen.queryByText("Pending inventory")).not.toBeInTheDocument();
  });
});
