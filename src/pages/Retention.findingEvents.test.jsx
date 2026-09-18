// src/pages/Retention.findingEvents.test.jsx
//
// Las dos ventanas del historial de hallazgos de SCP en la página de
// retención.
//
// Lo que esto vigila no es el render: es que la clave que el campo manda sea
// EXACTAMENTE la que el backend acepta. Un campo con la clave mal escrita se
// pinta igual, se deja teclear igual y guarda igual — y no cambia nada en la
// base. `complianceFindingEventsDays` llevaba existiendo en el backend desde
// agosto sin ningún campo en el portal, así que nadie lo habría notado.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../api/retention", () => ({
  getRetentionStats: vi.fn(),
  updateRetentionPolicy: vi.fn(),
  runRetention: vi.fn(),
}));

import Retention from "./Retention";
import { getRetentionStats, updateRetentionPolicy } from "../api/retention";

const STATS = {
  ok: true,
  policy: {
    tenantId: "111",
    enabled: true,
    factsEventsDays: 30,
    complianceFindingEventsDays: null,
    complianceFindingEventsRefreshDays: null,
    preserveBaseline: true,
    preserveLatest: true,
    batchSize: 5000,
    lastRunAtUtc: null,
    lastRunDeletedTotal: null,
    lastRunSummary: null,
  },
  sizes: {
    tenantId: "111",
    tenantDb: "CWSBtracenium-T111",
    perTable: [{ table: "compliance_finding_events", rows: 663673, sizeBytes: 252706816 }],
  },
};

beforeEach(() => {
  getRetentionStats.mockReset().mockResolvedValue(STATS);
  updateRetentionPolicy.mockReset().mockResolvedValue({ ok: true, policy: STATS.policy });
});
afterEach(cleanup);

async function renderPage() {
  render(<Retention onNavigate={() => {}} />);
  await waitFor(() => expect(screen.getByText("Finding timeline — evidence heartbeat")).toBeTruthy());
}

describe("Retention — historial de hallazgos", () => {
  it("ofrece las dos ventanas por separado", async () => {
    await renderPage();
    expect(screen.getByText("Finding timeline — evidence heartbeat")).toBeTruthy();
    expect(screen.getByText("Finding timeline — history")).toBeTruthy();
  });

  it("enseña el tamaño real de la tabla que se va a recortar", async () => {
    // Sin esto la página pedía una decisión sobre una tabla cuyo tamaño no
    // enseñaba: `compliance_finding_events` no estaba en el panel de tamaños.
    await renderPage();
    const filas = screen.getAllByText(/compliance_finding_events · 663,673 rows/);
    expect(filas.length).toBe(2);
  });

  it("⚠️ manda la clave que el backend acepta, y sólo el campo tocado", async () => {
    await renderPage();
    const heartbeat = screen
      .getByText("Finding timeline — evidence heartbeat")
      .closest("div").parentElement.querySelector("input[type=number]");
    fireEvent.change(heartbeat, { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateRetentionPolicy).toHaveBeenCalled());
    const patch = updateRetentionPolicy.mock.calls[0][0];
    expect(patch).toEqual({ complianceFindingEventsRefreshDays: 90 });
    // La ventana larga se decide después de medir el caudal: guardar la corta
    // no puede fijarla de tapadillo.
    expect(patch).not.toHaveProperty("complianceFindingEventsDays");
  });

  it("en blanco es 'nunca borrar', no un valor por defecto", async () => {
    await renderPage();
    const heartbeat = screen
      .getByText("Finding timeline — evidence heartbeat")
      .closest("div").parentElement.querySelector("input[type=number]");
    expect(heartbeat.value).toBe("");
  });
});
