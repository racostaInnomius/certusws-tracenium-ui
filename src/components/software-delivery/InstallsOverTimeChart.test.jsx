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

import InstallsOverTimeChart, { InstallsLegend, endLabelOffsets } from "./InstallsOverTimeChart";
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

// ⚠️ EL BUG QUE SE VEÍA EN PRODUCCIÓN.
//
// Las dos etiquetas de fin se colocaban en `y={y}` sin separarse. Cuando las
// series terminaban en el mismo valor —lo normal en un tenant tranquilo: ambas
// en 0— los dos `<text>` caían en coordenadas idénticas y la captura mostraba
// `0 faileded`: las dos palabras una encima de la otra.
//
// El cálculo es puro y se prueba sin render: los píxeles no existen todavía
// cuando hay que decidir la separación.
describe("endLabelOffsets · dos etiquetas no se pisan", () => {
  it("separa las series que terminan en el MISMO valor", () => {
    // La forma exacta de la captura: días con actividad y el último en 0/0.
    const off = endLabelOffsets([
      { day: "09-01", succeeded: 1, failed: 6 },
      { day: "09-06", succeeded: 0, failed: 0 },
    ]);

    expect(off.get("succeeded")).toBeDefined();
    expect(off.get("failed")).toBeDefined();
    expect(off.get("succeeded")).not.toBe(off.get("failed"));
    // ⚠️ Ninguna se mueve hacia ABAJO: ahí están las marcas del eje X, y
    // empujar una etiqueta contra ellas cambia un solape por otro.
    expect(off.get("succeeded")).toBeLessThanOrEqual(0);
    expect(off.get("failed")).toBeLessThanOrEqual(0);
  });

  // El eje está invertido: más valor = menos `y`. La etiqueta de arriba tiene
  // que ser la de la línea de arriba, o el arreglo cambia un solape por una
  // confusión peor.
  it("pone arriba la etiqueta de la serie más alta", () => {
    // Cerca pero no iguales: 39 y 40 sobre un rango 0–40 quedan al 2,5%, por
    // debajo del umbral. (9 y 10 sobre 0–10 están al 10% y NO chocan — lo
    // comprobé al revés y el test me lo dijo.)
    const off = endLabelOffsets([
      { day: "d1", succeeded: 0, failed: 0 },
      { day: "d2", succeeded: 39, failed: 40 },
    ]);
    // dy negativo = hacia arriba en SVG.
    expect(off.get("failed")).toBeLessThan(off.get("succeeded"));
  });

  // ⚠️ Sólo se toca lo que se estorba. Desplazar etiquetas bien colocadas las
  // alejaría de su línea, que es el problema que se intenta evitar.
  it("no mueve nada cuando las series terminan lejos", () => {
    const off = endLabelOffsets([
      { day: "d1", succeeded: 0, failed: 0 },
      { day: "d2", succeeded: 40, failed: 1 },
    ]);
    expect(off.size).toBe(0);
  });

  it("aguanta datos vacíos, una sola fila y valores ausentes", () => {
    expect(endLabelOffsets([]).size).toBe(0);
    expect(endLabelOffsets(undefined).size).toBe(0);
    expect(endLabelOffsets([{ day: "d1" }]).size).toBe(0);
    // Una sola serie con valor: no hay con quién chocar.
    expect(endLabelOffsets([{ day: "d1", succeeded: 3 }]).size).toBe(0);
  });

  // Todo plano en el mismo valor: el rango es 0 y la división por rango sería
  // NaN. Es el caso más común de todos —una flota sin actividad— así que no
  // puede depender de una casualidad aritmética.
  it("separa aunque TODO el rango sea plano", () => {
    const off = endLabelOffsets([
      { day: "d1", succeeded: 0, failed: 0 },
      { day: "d2", succeeded: 0, failed: 0 },
    ]);
    expect(off.size).toBe(2);
    expect(off.get("succeeded")).not.toBe(off.get("failed"));
  });
});

describe("las etiquetas separadas siguen siendo dos y legibles", () => {
  it("con ambas series en 0 dibuja DOS etiquetas, no una encima de otra", () => {
    const { container } = render(
      <InstallsOverTimeChart
        data={[
          { day: "09-01", succeeded: 1, failed: 6 },
          { day: "09-06", succeeded: 0, failed: 0 },
        ]}
      />
    );
    const labels = [...container.querySelectorAll("text")].filter((t) =>
      /succeeded|failed/i.test(t.textContent || "")
    );
    expect(labels).toHaveLength(2);

    // La prueba de que no se solapan: sus `dy` difieren.
    const dys = labels.map((t) => Number(t.getAttribute("dy")));
    expect(new Set(dys).size).toBe(2);
  });
});
