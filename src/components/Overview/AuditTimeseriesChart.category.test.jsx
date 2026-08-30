// src/components/Overview/AuditTimeseriesChart.category.test.jsx
//
// El eje de la gráfica de auditoría: outcome (Overview) vs categoría
// (Audit).
//
// POR QUÉ EXISTE EL SEGUNDO EJE. Medido en la control DB de producción el
// 2026-08-27: el 98,4% de los eventos tienen outcome `ok`, así que apilar
// por resultado da una línea plana que ningún dato real puede mover. Una
// gráfica que no puede cambiar de forma no informa; sólo ocupa 220 px
// encima de la tabla.
//
// Lo que se fija aquí, y es lo delicado: las series salen de los DATOS, no
// de una lista escrita en el frontend. Una familia de eventos nueva en el
// backend tiene que aparecer sola. Ese es justo el fallo que ya cometió
// esta app con SOURCE_LABEL y VALID_SOURCES: enums re-listados a mano que
// divergieron y escondieron cosas sin avisar.
//
// ResponsiveContainer mide el padre y en jsdom eso es 0×0, así que
// Recharts no pinta nada dentro. Se sustituye por el clon con medidas que
// hace el contenedor real — la medición es lo único que se salta.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

vi.mock("recharts", async () => {
  const actual = await vi.importActual("recharts");
  const { cloneElement, createElement } = await import("react");
  // Animación de entrada apagada: lo que se mide aquí es qué series se
  // pintan, no cuándo. Con ella puesta, el test depende de lo cargada que
  // esté la máquina — así se cayeron tres de JobsTimeseriesChart bajo la
  // suite completa mientras pasaban en solitario.
  const Bar = (props) => createElement(actual.Bar, { ...props, isAnimationActive: false });
  Object.assign(Bar, actual.Bar);
  return {
    ...actual,
    Bar,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 600, height: 220 }),
  };
});

vi.mock("../../api/overview", () => ({ getAuditTimeseries: vi.fn() }));

import AuditTimeseriesChart from "./AuditTimeseriesChart";

afterEach(cleanup);

/** La envoltura allSettled que el componente espera. */
function result(buckets) {
  return { status: "fulfilled", value: { windowDays: 7, buckets } };
}

const CATS = (o) => ({
  Policy: 0,
  Identity: 0,
  "Devices & PKI": 0,
  "Billing & reports": 0,
  Security: 0,
  Other: 0,
  ...o,
});

const BUCKETS = [
  { bucket: "2026-08-25", ok: 10, rejected: 0, error: 0, categories: CATS({ Policy: 8, Identity: 2 }) },
  { bucket: "2026-08-26", ok: 9, rejected: 1, error: 0, categories: CATS({ Policy: 4, "Devices & PKI": 6 }) },
];

function draw(props) {
  return render(
    <div style={{ width: 600, height: 220 }}>
      <AuditTimeseriesChart result={result(BUCKETS)} loading={false} {...props} />
    </div>
  );
}

/** Los nombres de la leyenda, que son las series realmente pintadas. */
async function legend(container) {
  await waitFor(() => expect(container.querySelector(".recharts-legend-item-text")).toBeTruthy());
  return [...container.querySelectorAll(".recharts-legend-item-text")].map((n) => n.textContent);
}

describe("AuditTimeseriesChart — eje", () => {
  it("por defecto apila por outcome, y Overview no cambia", async () => {
    const { container } = draw();
    const names = await legend(container);
    expect(names).toEqual(expect.arrayContaining(["OK", "Rejected", "Error"]));
    expect(names).not.toContain("Policy");
  });

  it('con variant="category" apila por familia', async () => {
    const { container } = draw({ variant: "category" });
    const names = await legend(container);
    expect(names).toEqual(expect.arrayContaining(["Policy", "Identity", "Devices & PKI"]));
    expect(names).not.toContain("OK");
  });

  it("las series salen de los datos, no de una lista del frontend", async () => {
    // Una categoría que el backend invente mañana tiene que pintarse sin
    // tocar el componente.
    const { container } = render(
      <div style={{ width: 600, height: 220 }}>
        <AuditTimeseriesChart
          variant="category"
          loading={false}
          result={result([
            { bucket: "2026-08-26", ok: 1, rejected: 0, error: 0, categories: { "Quantum readiness": 3 } },
          ])}
        />
      </div>
    );
    expect(await legend(container)).toContain("Quantum readiness");
  });

  it("no pinta las categorías vacías en toda la ventana", async () => {
    // Con ~50 acciones al mes la mitad de las familias no tiene nada. Una
    // leyenda de seis entradas de las que cuatro son invisibles miente
    // sobre lo que hay dentro.
    const { container } = draw({ variant: "category" });
    const names = await legend(container);
    expect(names).not.toContain("Security");
    expect(names).not.toContain("Other");
  });

  it("mira TODOS los días, no sólo el primero", async () => {
    // "Devices & PKI" sólo existe en el segundo bucket. Derivar las series
    // del primer día la perdería, y sin ruido: la gráfica simplemente
    // dibujaría columnas más bajas de lo que dicen los datos.
    const { container } = draw({ variant: "category" });
    expect(await legend(container)).toContain("Devices & PKI");
  });

  it("cambia el título para que se sepa qué se está mirando", async () => {
    const outcome = draw();
    expect(outcome.container.textContent).toMatch(/Audit events/);
    cleanup();
    const cat = draw({ variant: "category" });
    expect(cat.container.textContent).toMatch(/Activity by area/);
  });
});
