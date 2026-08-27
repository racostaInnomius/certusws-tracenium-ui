// src/components/software-delivery/InstallsOverTimeChart.test.jsx
//
// These pin two things that look like taste and are not.
//
// The palette is a MEASURED pair. Succeeded (#52B788) against the soft red
// (#E37D78) separates by ΔE 3.1 for a deuteranope — the two series whose
// distinction is the whole point of the chart were nearly the same colour for
// the most common form of colour blindness. The darker `errorText` takes the
// pair to ΔE 18.0. Nothing on screen reveals that regression: it would look
// fine to whoever changed it back.
//
// The frame is the other one. A grid and a Y axis are easy to re-add "for
// readability" and they are what made the chart read as a spreadsheet.
//
// Same jsdom problem as JobsTimeseriesChart: ResponsiveContainer measures its
// parent, jsdom reports 0×0, and Recharts renders nothing. Substituting a
// fixed-size container is what makes the SVG assertable.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("recharts", async () => {
  const actual = await vi.importActual("recharts");
  const { cloneElement } = await import("react");
  return {
    ...actual,
    ResponsiveContainer: ({ children }) =>
      cloneElement(children, { width: 600, height: 220 }),
  };
});

import InstallsOverTimeChart, { InstallsLegend } from "./InstallsOverTimeChart";
import { BRAND, ROLE } from "../../theme/brand";

afterEach(cleanup);

const DATA = [
  { day: "08-20", succeeded: 12, failed: 2 },
  { day: "08-21", succeeded: 9, failed: 0 },
  { day: "08-22", succeeded: 14, failed: 5 },
];

function strokes(container) {
  return [...container.querySelectorAll("path.recharts-curve")].map((p) =>
    p.getAttribute("stroke")
  );
}

describe("InstallsOverTimeChart · palette", () => {
  it("draws Failed in the dark red, not the soft one that collides with the green", () => {
    const { container } = render(<InstallsOverTimeChart data={DATA} />);
    const drawn = strokes(container);

    expect(drawn).toContain(ROLE.positive);
    expect(drawn).toContain(BRAND.alert.errorText);
    // The regression this file exists to catch.
    expect(drawn).not.toContain(BRAND.alert.error);
  });

  it("keeps the two series on different colours at all", () => {
    const { container } = render(<InstallsOverTimeChart data={DATA} />);
    const drawn = strokes(container).filter(Boolean);
    expect(new Set(drawn).size).toBe(drawn.length);
  });
});

describe("InstallsOverTimeChart · the frame stays off", () => {
  it("renders no cartesian grid and no Y axis", () => {
    const { container } = render(<InstallsOverTimeChart data={DATA} />);
    expect(container.querySelector(".recharts-cartesian-grid")).toBeNull();
    expect(container.querySelector(".recharts-yAxis")).toBeNull();
  });

  it("keeps the X axis, because the reader still needs the day", () => {
    const { container } = render(<InstallsOverTimeChart data={DATA} />);
    expect(container.querySelector(".recharts-xAxis")).not.toBeNull();
  });
});

describe("InstallsOverTimeChart · direct labels", () => {
  // The validator WARNs that the green sits under 3:1 against the surface,
  // which obligates visible labels. They are a requirement, not decoration.
  it("labels the last value of each series", () => {
    render(<InstallsOverTimeChart data={DATA} />);
    expect(screen.getByText(/succeeded/i)).toBeTruthy();
    expect(screen.getByText(/failed/i)).toBeTruthy();
  });

  // A number on every point is noise. Two series over three days would be six
  // labels; there must be two.
  it("labels only the end of the line, not every point", () => {
    const { container } = render(<InstallsOverTimeChart data={DATA} />);
    const labels = [...container.querySelectorAll("text")].filter((t) =>
      /succeeded|failed/i.test(t.textContent || "")
    );
    expect(labels).toHaveLength(2);
  });

  it("survives an empty series without drawing a stray label", () => {
    const { container } = render(<InstallsOverTimeChart data={[]} />);
    const labels = [...container.querySelectorAll("text")].filter((t) =>
      /succeeded|failed/i.test(t.textContent || "")
    );
    expect(labels).toHaveLength(0);
  });
});

describe("InstallsLegend", () => {
  // Identity must never rest on colour alone; for two series a legend is not
  // optional. What moved is where it lives, not whether it exists.
  it("names both series", () => {
    render(<InstallsLegend />);
    expect(screen.getByText("Succeeded")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
  });

  it("writes the labels in text ink, never in the series colour", () => {
    render(<InstallsLegend />);
    const label = screen.getByText("Succeeded");
    expect(label).not.toHaveStyle({ color: ROLE.positive });
  });
});
