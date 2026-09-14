import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

// "FleetComposition — OS platform donut reconciliation" se fue con la dona:
// el Overview pinta ahora Fleet composition (FleetCompositionDonut), cuyo total
// sale de /hardware-inventory/summary y no se concilia contra fleetDevices.

describe("FleetComposition (Overview)", () => {
  it("⭐ la primera dona es Fleet composition, no OS platform", () => {
    render(
      <FleetComposition
        results={{
          dashboardSummary: fulfilled({ fleetDevices: 20, osPlatform: [{ os_platform: "Windows", host_count: 20 }] }),
          hardwareSummary: fulfilled({ fleet: { total: 20, composition: { laptop: 12, desktop: 5, server: 3, unknown: 0, virtual: 3 } } }),
        }}
      />
    );

    expect(screen.getByText("Fleet composition")).toBeTruthy();
    expect(screen.queryByText("OS platform")).toBeNull();
    expect(screen.getByRole("img", { name: /20 devices: 12 laptops, 5 desktops, 3 servers/ })).toBeTruthy();
  });

  it("⭐ un segmento lleva a Hardware Inventory con ESE segmento filtrado", () => {
    const onNavigate = vi.fn();
    render(
      <FleetComposition
        onNavigate={onNavigate}
        results={{ hardwareSummary: fulfilled({ fleet: { total: 2, composition: { laptop: 2 } } }) }}
      />
    );

    fireEvent.click(screen.getByText("Laptops 2"));
    // Hardware Inventory pinta la misma dona (mismo endpoint) y filtra la
    // tabla por el segmento: la cifra pulsada es la que se ve al llegar.
    expect(onNavigate).toHaveBeenCalledWith("assets", { assetsTab: "hardware", hwFleet: "laptop" });
  });

  it("⭐ un grupo de Agent versions lleva a Assets filtrado por ese grupo", () => {
    // Assets filtra la versión en el servidor con esta misma regla (validado
    // en el portal: Older 4 → "4 of 4"), así que el segmento vuelve a filtrar.
    const onNavigate = vi.fn();
    render(
      <FleetComposition
        onNavigate={onNavigate}
        results={{
          latestVersions: fulfilled([{ platform: "windows", arch: "x64", ok: true, data: { latestVersion: "1.1.70" } }]),
          agentVersions: fulfilled({ total: 6, byVersion: [{ version: "1.1.70", count: 3 }, { version: "1.1.63", count: 3 }] }),
        }}
      />
    );

    fireEvent.click(screen.getByText("Older"));
    expect(onNavigate).toHaveBeenCalledWith("assets", { versionBucket: "older" });
  });

  it("mientras carga no dice 'No devices to classify'", () => {
    render(<FleetComposition loading results={null} />);

    expect(screen.queryByText("No devices to classify")).toBeNull();
  });
});
