// src/components/liveQuery/LiveQueryPanel.test.jsx
//
// ADR-0029 F3 — la pestaña Live Query.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../../api/liveQuery", () => ({
  listLiveQueries: vi.fn(),
  createLiveQuery: vi.fn(),
  getLiveQuery: vi.fn(),
  listLiveQueryProbes: vi.fn(),
}));
vi.mock("../../api/assetGroups", () => ({ listAssetGroups: vi.fn() }));
import { createLiveQuery, getLiveQuery, listLiveQueries } from "../../api/liveQuery";
import { listAssetGroups } from "../../api/assetGroups";
import LiveQueryPanel from "./LiveQueryPanel";

const Q = "11111111-2222-3333-4444-555555555555";
const answer = (over = {}) => ({
  queryId: Q,
  probe: "process",
  probeLabel: "Running process",
  params: { name: "AnyDesk.exe" },
  target: { scope: "all" },
  createdAt: new Date().toISOString(),
  answerBy: new Date(Date.now() - 1000).toISOString(),
  open: false,
  targeted: 6,
  counts: { answered: 3, pending: 0, error: 1, unsupported: 0, offline: 2, no_answer: 0 },
  answers: [
    { key: "not running", devices: 2 },
    { key: "running", devices: 1 },
  ],
  devices: {
    page: 1,
    pageSize: 50,
    total: 3,
    items: [
      { deviceId: "d1", hostname: "FINANZAS-01", status: "answered", answer: { running: true, count: 1, instances: [{ pid: 4242, user: "ACME\\ana" }] }, keys: ["running"], error: null, answeredAt: new Date().toISOString() },
      { deviceId: "d2", hostname: "PORTATIL-VIAJE", status: "offline", answer: null, keys: [], error: null, answeredAt: null },
      { deviceId: "d3", hostname: "SRV-01", status: "error", answer: null, keys: [], error: "tasklist exited 1", answeredAt: null },
    ],
  },
  ...over,
});

beforeEach(() => {
  listLiveQueries.mockResolvedValue({ ok: true, queries: [] });
  listAssetGroups.mockResolvedValue({ ok: true, items: [{ id: 4, name: "Servers" }] });
  getLiveQuery.mockResolvedValue({ ok: true, query: answer() });
  createLiveQuery.mockResolvedValue({ ok: true, query: { queryId: Q } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const askFor = async (name) => {
  fireEvent.change(await screen.findByLabelText("Process name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
};

describe("LiveQueryPanel", () => {
  it("⭐ dice lo esencial sin que nadie pregunte: sólo conectados, un apagado no es un «no», nada cambia, queda en auditoría", async () => {
    render(<LiveQueryPanel />);
    expect(await screen.findByText(/Only devices connected right now are asked/)).toBeInTheDocument();
    expect(screen.getByText(/never count as a “no”/)).toBeInTheDocument();
    expect(screen.getByText(/nothing is changed on the devices/)).toBeInTheDocument();
    expect(screen.getByText(/recorded in the audit log/)).toBeInTheDocument();
  });

  it("pregunta a toda la flota con los parámetros recortados", async () => {
    render(<LiveQueryPanel />);
    await askFor("  AnyDesk.exe ");
    await waitFor(() => expect(createLiveQuery).toHaveBeenCalledWith({ probe: "process", params: { name: "AnyDesk.exe" }, target: { scope: "all" } }));
  });

  it("⭐ la respuesta: recuento por estado con los apagados aparte, agregado por respuesta y detalle por equipo", async () => {
    render(<LiveQueryPanel />);
    await askFor("AnyDesk.exe");
    const result = within(await screen.findByTestId("lq-result"));
    expect(result.getByText("Running process: AnyDesk.exe")).toBeInTheDocument();
    expect(result.getByTestId("lq-status-answered")).toHaveTextContent("Answered · 3");
    expect(result.getByTestId("lq-status-offline")).toHaveTextContent("Offline — not asked · 2");
    expect(result.getByTestId("lq-status-error")).toHaveTextContent("Could not check · 1");
    // 6 objetivos − 2 apagados = 4 preguntados.
    expect(result.getByText(/4 connected devices asked/)).toBeInTheDocument();
    const rows = result.getAllByTestId("lq-answer-row");
    expect(rows.map((r) => r.textContent)).toEqual(["Not running2", "Running1"]);
    const table = within(result.getByTestId("lq-devices"));
    expect(table.getByText("Running · 1 instance · ACME\\ana")).toBeInTheDocument();
    expect(table.getByText("tasklist exited 1")).toBeInTheDocument();
  });

  it("pulsar una respuesta filtra los equipos por ella", async () => {
    render(<LiveQueryPanel />);
    await askFor("AnyDesk.exe");
    const rows = await screen.findAllByTestId("lq-answer-row");
    fireEvent.click(rows[1]);
    await waitFor(() => expect(getLiveQuery).toHaveBeenLastCalledWith(Q, expect.objectContaining({ key: "running", status: null })));
  });

  it("⚠️ mientras hay equipos a tiempo se relee; cerrada, se deja de preguntar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getLiveQuery
      .mockResolvedValueOnce({ ok: true, query: answer({ open: true, answerBy: new Date(Date.now() + 60_000).toISOString(), counts: { answered: 0, pending: 4, offline: 2 }, answers: [] }) })
      // Cerrada y con el plazo vencido hace rato: ni siquiera el último vistazo.
      .mockResolvedValue({ ok: true, query: answer({ answerBy: new Date(Date.now() - 60_000).toISOString() }) });
    render(<LiveQueryPanel />);
    await askFor("AnyDesk.exe");
    expect(await screen.findByText(/waiting for answers/)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2100);
    expect(await screen.findByTestId("lq-status-answered")).toHaveTextContent("Answered · 3");
    const calls = getLiveQuery.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getLiveQuery.mock.calls.length).toBe(calls);
  });

  it("⭐ el atajo de un equipo lo deja puesto como objetivo", async () => {
    render(<LiveQueryPanel initialTarget={{ scope: "devices", deviceIds: ["d1"], label: "FINANZAS-01" }} targetNonce={1} />);
    expect(await screen.findByText("FINANZAS-01")).toBeInTheDocument();
    await askFor("AnyDesk.exe");
    await waitFor(() => expect(createLiveQuery.mock.calls[0][0].target).toEqual({ scope: "devices", deviceIds: ["d1"] }));
  });

  it("el atajo de un grupo pregunta a ese grupo", async () => {
    render(<LiveQueryPanel initialTarget={{ scope: "group", groupId: 4 }} targetNonce={1} />);
    await askFor("AnyDesk.exe");
    await waitFor(() => expect(createLiveQuery.mock.calls[0][0].target).toEqual({ scope: "group", groupId: 4 }));
  });

  it("el motivo del servidor se enseña tal cual (límite, credenciales, sin equipos)", async () => {
    createLiveQuery.mockRejectedValue({ body: { error: "RATE_LIMITED", message: "Up to 20 live queries every 10 minutes. Try again in a few minutes." } });
    render(<LiveQueryPanel />);
    await askFor("AnyDesk.exe");
    expect(await screen.findByText(/Up to 20 live queries every 10 minutes/)).toBeInTheDocument();
  });

  it("no manda lo que seguro se rechaza", async () => {
    render(<LiveQueryPanel />);
    await askFor("C:\\Tools\\AnyDesk.exe");
    expect(await screen.findByText("Use the name, not a path.")).toBeInTheDocument();
    expect(createLiveQuery).not.toHaveBeenCalled();
  });

  it("el historial reabre una pregunta", async () => {
    listLiveQueries.mockResolvedValue({ ok: true, queries: [{ queryId: Q, probe: "port", probeLabel: "Listening port", params: { port: 3389 }, createdAt: new Date().toISOString(), targeted: 5, offline: 2, answered: 3 }] });
    render(<LiveQueryPanel />);
    const history = within(await screen.findByTestId("lq-history"));
    expect(history.getByText(/3 answered · 5 targeted · 2 offline/)).toBeInTheDocument();
    fireEvent.click(history.getByText("Listening port: TCP 3389"));
    await waitFor(() => expect(getLiveQuery).toHaveBeenCalledWith(Q, expect.anything()));
  });
});
