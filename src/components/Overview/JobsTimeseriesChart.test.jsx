// src/components/Overview/JobsTimeseriesChart.test.jsx
//
// The point of these tests is the `variant` branch and nothing else.
//
// The card is shared by three pages: Overview and Software Delivery want the
// three lines, the Jobs page wants the stack. A prop that silently fell back
// to the default would look fine in every unit test that only reads text, and
// the regression would only show up on screen — which is exactly how the
// stacked chart went missing from the Jobs refactor in the first place.
//
// ResponsiveContainer measures its parent, and jsdom reports 0×0, so Recharts
// renders nothing at all inside it. Substituting a fixed-size div is what makes
// the SVG assertable; everything else comes from the real library.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

vi.mock("recharts", async () => {
  const actual = await vi.importActual("recharts");
  const { cloneElement } = await import("react");
  return {
    ...actual,
    // What the real container does once it has measured: hand the chart an
    // explicit width and height. Here the measurement is skipped, not faked.
    ResponsiveContainer: ({ children }) =>
      cloneElement(children, { width: 600, height: 220 }),
  };
});

import JobsTimeseriesChart from "./JobsTimeseriesChart";
import { BRAND, ROLE } from "../../theme/brand";

afterEach(cleanup);

const result = {
  status: "fulfilled",
  value: {
    windowDays: 7,
    buckets: [
      { bucket: "2026-08-19", completed: 12, failed: 2, inFlight: 1 },
      { bucket: "2026-08-20", completed: 9, failed: 0, inFlight: 3 },
    ],
  },
};

function renderChart(props) {
  return render(
    <div style={{ width: 600, height: 220 }}>
      <JobsTimeseriesChart result={result} loading={false} {...props} />
    </div>
  );
}

describe("JobsTimeseriesChart · variant", () => {
  it("draws lines by default — Overview and Software Delivery are untouched", () => {
    const { container } = renderChart();
    expect(container.querySelector(".recharts-line")).toBeTruthy();
    expect(container.querySelector(".recharts-bar")).toBeNull();
  });

  it('draws a stack when variant="stacked" — what the Jobs page asks for', () => {
    const { container } = renderChart({ variant: "stacked" });
    expect(container.querySelector(".recharts-bar")).toBeTruthy();
    expect(container.querySelector(".recharts-line")).toBeNull();
  });

  it("stacks all three series on one column, failed on top", async () => {
    const { container } = renderChart({ variant: "stacked" });
    const bars = [...container.querySelectorAll(".recharts-bar")];
    expect(bars).toHaveLength(3);

    // Recharts paints the segments through its enter animation, so the <rect>
    // inside each layer does not exist on the first commit.
    await waitFor(() =>
      expect(container.querySelector(".recharts-bar-rectangle rect")).toBeTruthy()
    );

    // Declaration order is bottom-to-top in a Recharts stack, and the layers
    // come out in that order. Asserted by fill because the dataKey does not
    // reach the DOM: if someone reorders the <Bar> elements, the red band
    // stops being the one that grows into empty space — which is the whole
    // reason the stack is here rather than three lines.
    const fills = bars.map((b) =>
      b.querySelector(".recharts-bar-rectangle rect")?.getAttribute("fill")
    );
    expect(fills).toEqual([ROLE.positive, BRAND.cyanText, ROLE.critical]);
  });

  it("drops the grid and the Y axis — the frame is what read as a spreadsheet", async () => {
    const { container } = renderChart({ variant: "stacked" });
    await waitFor(() =>
      expect(container.querySelector(".recharts-bar-rectangle rect")).toBeTruthy()
    );
    expect(container.querySelector(".recharts-cartesian-grid")).toBeNull();
    expect(container.querySelector(".recharts-yAxis")).toBeNull();
    // The day labels stay: a stack with no x labels cannot be read at all.
    expect(container.querySelector(".recharts-xAxis")).toBeTruthy();
  });

  it("keeps a one-job segment visible instead of subtracting it away", async () => {
    // The gap between segments is carved out of each segment's own height, so
    // without a floor a single failure inside a big day would shrink to
    // nothing — the one segment that must never disappear.
    const { container } = render(
      <div style={{ width: 600, height: 220 }}>
        <JobsTimeseriesChart
          variant="stacked"
          loading={false}
          result={{
            status: "fulfilled",
            value: {
              windowDays: 7,
              buckets: [{ bucket: "2026-08-19", completed: 400, failed: 1, inFlight: 0 }],
            },
          }}
        />
      </div>
    );
    await waitFor(() =>
      expect(container.querySelector(".recharts-bar-rectangle rect")).toBeTruthy()
    );

    const failed = [...container.querySelectorAll(".recharts-bar-rectangle rect")].find(
      (r) => r.getAttribute("fill") === ROLE.critical
    );
    expect(failed).toBeTruthy();
    expect(Number(failed.getAttribute("height"))).toBeGreaterThanOrEqual(3);
  });

  it("renders the same heading in both variants", () => {
    const lines = renderChart();
    expect(lines.getByText(/Jobs by status — last 7 days/)).toBeInTheDocument();
    cleanup();
    const stacked = renderChart({ variant: "stacked" });
    expect(stacked.getByText(/Jobs by status — last 7 days/)).toBeInTheDocument();
  });
});
