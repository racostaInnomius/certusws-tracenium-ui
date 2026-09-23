// ADR-0031 — la pestaña «Activity».
//
// ⚠️ Lo que vigilan estos tests no es el maquetado, son las cuatro formas que
// tiene esta vista de AFIRMAR algo que no sabe:
//
//   1. Una fuente que no se pudo leer, presentada como un rato sin actividad.
//   2. Un recorte, presentado como «esto es todo».
//   3. «No consta acción nuestra», presentado como «sabemos quién fue».
//   4. Una lista vacía, presentada como «no pasó nada en el equipo».

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import ActivityTab, { ActivityView, groupByDay } from "./ActivityTab";

const getDeviceActivity = vi.fn();
vi.mock("../../api/activity", () => ({
  getDeviceActivity: (...a) => getDeviceActivity(...a),
}));

const AG = "9b7dc1ab-abfd-4ef9-bdfe-bd1bc653d5e8";

const evento = (over = {}) => ({
  at: "2026-09-22T20:27:16.000Z",
  lane: "observed",
  source: "compliance_finding_events",
  kind: "config.changed",
  title: "Security setting changed: windows.registry.smb1_4606db",
  detail: "fail → pass",
  status: "pass",
  actor: null,
  ref: { findingEventId: "1" },
  ...over,
});

const respuesta = (over = {}) => ({
  ok: true,
  activity: {
    agentId: AG,
    from: "2026-09-16T00:00:00.000Z",
    to: "2026-09-23T00:00:00.000Z",
    events: [],
    sources: [{ id: "device_jobs", lane: "sent", status: "ok", count: 0, truncated: false }],
    truncated: false,
    ...over,
  },
});

beforeEach(() => {
  getDeviceActivity.mockReset();
  getDeviceActivity.mockResolvedValue(respuesta());
});
afterEach(cleanup);

describe("ActivityView — lo que se dice sin que nadie pregunte", () => {
  it("⚠️ una fuente que FALLÓ se nombra: el hueco no es un rato sin actividad", () => {
    render(
      <ActivityView
        data={{
          events: [],
          sources: [
            { id: "device_jobs", lane: "sent", status: "error", count: 0, truncated: false },
            { id: "remote_sessions", lane: "sent", status: "ok", count: 0, truncated: false },
          ],
        }}
      />
    );
    const aviso = screen.getByText(/could not be read/i);
    expect(aviso).toBeInTheDocument();
    expect(aviso.textContent).toMatch(/device_jobs/);
    expect(aviso.textContent).toMatch(/incomplete/i);
  });

  it("⚠️ un recorte se dice, y dice qué hacer", () => {
    render(<ActivityView data={{ events: [evento()], sources: [], truncated: true }} />);
    expect(screen.getByText(/Only the most recent/i).textContent).toMatch(/Narrow the dates/i);
  });

  it("⚠️ vacío NO es «no pasó nada en el equipo»", () => {
    render(<ActivityView data={{ events: [], sources: [] }} />);
    expect(screen.getByText(/Nothing recorded for this device/i)).toBeInTheDocument();
    expect(screen.getByText(/not that nothing happened on the device/i)).toBeInTheDocument();
  });

  it("⭐ «Not from Tracenium» se explica: no consta acción nuestra ≠ saber quién fue", async () => {
    render(<ActivityView data={{ events: [evento({ attribution: "not_tracenium" })], sources: [] }} />);
    const chip = screen.getByText("Not from Tracenium");
    expect(chip).toBeInTheDocument();
    fireEvent.mouseOver(chip);
    expect(await screen.findByText(/not the same as knowing who made it/i)).toBeInTheDocument();
  });

  it("lo nuestro se marca como nuestro", () => {
    render(<ActivityView data={{ events: [evento({ attribution: "tracenium" })], sources: [] }} />);
    expect(screen.getByText("By Tracenium")).toBeInTheDocument();
  });

  it("un evento sin atribución no inventa el chip", () => {
    render(<ActivityView data={{ events: [evento({ kind: "hardware.firmware", attribution: undefined })], sources: [] }} />);
    expect(screen.queryByText("By Tracenium")).not.toBeInTheDocument();
    expect(screen.queryByText("Not from Tracenium")).not.toBeInTheDocument();
  });

  it("una fuente que aún no existe en el despliegue se dice aparte, sin alarmar", () => {
    render(
      <ActivityView
        data={{ events: [], sources: [{ id: "snapshot_results", lane: "sent", status: "unavailable", count: 0, truncated: false }] }}
      />
    );
    expect(screen.getByText(/Not available in this deployment/i).textContent).toMatch(/snapshot_results/);
    expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
  });

  it("⭐ cada fila declara su carril: es lo que separa «lo hicimos» de «pasó»", () => {
    render(
      <ActivityView
        data={{
          events: [evento(), evento({ lane: "sent", kind: "job.agent_update", title: "Job: agent_update", status: "completed" })],
          sources: [],
        }}
      />
    );
    expect(screen.getByText("Observed")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
  });

  it("quién lo pidió sale en la fila", () => {
    render(<ActivityView data={{ events: [evento({ lane: "sent", actor: "op@tracenium.test" })], sources: [] }} />);
    expect(screen.getByText(/Requested by op@tracenium.test/)).toBeInTheDocument();
  });

  it("un error de carga no se presenta como un equipo sin actividad", () => {
    render(<ActivityView error="boom" />);
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing recorded/i)).not.toBeInTheDocument();
  });
});

describe("groupByDay", () => {
  it("agrupa conservando el orden que trajo el backend", () => {
    // ⚠️ Horas elegidas para caer en el mismo día en la zona de la suite
    // (America/Mexico_City, fijada en vitest.config): agrupar es una operación
    // sobre el día LOCAL, así que un instante de madrugada UTC cambiaría de
    // grupo según dónde se corra.
    const g = groupByDay([
      evento({ at: "2026-09-22T20:27:16.000Z" }),
      evento({ at: "2026-09-22T15:00:00.000Z" }),
      evento({ at: "2026-09-21T15:00:00.000Z" }),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].events).toHaveLength(2);
    expect(g[1].events).toHaveLength(1);
  });

  it("una fecha inválida no rompe la agrupación", () => {
    expect(groupByDay([evento({ at: "no-es-fecha" })])[0].day).toBe("—");
  });
});

describe("ActivityTab — la petición", () => {
  it("pide la ventana por defecto del equipo y pinta lo que llega", async () => {
    getDeviceActivity.mockResolvedValue(respuesta({ events: [evento({ attribution: "not_tracenium" })] }));
    render(<ActivityTab agentId={AG} />);

    await waitFor(() => expect(getDeviceActivity).toHaveBeenCalled());
    const [id, params] = getDeviceActivity.mock.calls.at(-1);
    expect(id).toBe(AG);
    // Hasta el último milisegundo del día: 00:00 del siguiente dejaría fuera
    // lo que pasó esta tarde.
    expect(params.from).toMatch(/T00:00:00\.000Z$/);
    expect(params.to).toMatch(/T23:59:59\.999Z$/);
    expect(params.lane).toBeUndefined();
    expect(await screen.findByText(/windows.registry.smb1/)).toBeInTheDocument();
  });

  it("filtrar por carril viaja en la petición", async () => {
    render(<ActivityTab agentId={AG} />);
    await waitFor(() => expect(getDeviceActivity).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Sent by Tracenium/i }));

    await waitFor(() => expect(getDeviceActivity).toHaveBeenCalledTimes(2));
    expect(getDeviceActivity.mock.calls.at(-1)[1].lane).toBe("sent");
  });

  it("⚠️ un rango del revés NO se pregunta: la lista vacía se leería como «no pasó nada»", async () => {
    render(<ActivityTab agentId={AG} />);
    await waitFor(() => expect(getDeviceActivity).toHaveBeenCalledTimes(1));

    // El paso intermedio es un rango VÁLIDO y se pregunta con razón: se cuenta
    // aparte para que lo que se mida sea sólo lo que pasa DESPUÉS de invertir.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-01" } });
    await waitFor(() => expect(getDeviceActivity).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-08-25" } });
    await waitFor(() => expect(screen.getByText(/end date is before the start date/i)).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 50));
    expect(getDeviceActivity).toHaveBeenCalledTimes(2);
    for (const [, params] of getDeviceActivity.mock.calls) {
      expect(Date.parse(params.from)).toBeLessThanOrEqual(Date.parse(params.to));
    }
  });

  it("sin equipo no se pregunta nada", () => {
    render(<ActivityTab agentId={null} />);
    expect(getDeviceActivity).not.toHaveBeenCalled();
  });

  it("declara en qué zona horaria están las horas, porque puede no ser la del equipo", async () => {
    render(<ActivityTab agentId={AG} />);
    expect(screen.getByText(/may not be the device/i)).toBeInTheDocument();
  });
});
