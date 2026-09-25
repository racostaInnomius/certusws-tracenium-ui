// src/components/Alerts/PlaybooksTab.test.jsx
//
// ADR-0034 F2 — la pestaña Playbooks.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../../api/playbooks", () => ({
  listPlaybooks: vi.fn(),
  createPlaybook: vi.fn(),
  updatePlaybook: vi.fn(),
  setPlaybookMode: vi.fn(),
  setPlaybookEnabled: vi.fn(),
  deletePlaybook: vi.fn(),
  listPlaybookRuns: vi.fn(),
  listPlaybookRunsForAlert: vi.fn(),
  getPlaybookLimits: vi.fn(),
}));
import { createPlaybook, listPlaybookRuns, listPlaybooks, setPlaybookMode } from "../../api/playbooks";
import PlaybooksTab from "./PlaybooksTab";

const PB = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "Fix the check that just failed",
  mode: "dry_run",
  enabled: true,
  runsToday: 3,
  pausedReason: null,
  armedBy: null,
  definition: {
    trigger: { event: "alert.opened", sources: ["compliance"], minSeverity: "medium", ruleIds: null },
    conditions: [],
    actions: [{ kind: "remediate", mode: "apply", checkId: null }],
    guards: { devicesPerTick: 25, runsPerDay: 50, cooldownHours: 6 },
  },
};

beforeEach(() => {
  listPlaybooks.mockResolvedValue({ ok: true, playbooks: [PB] });
  listPlaybookRuns.mockResolvedValue({ ok: true, runs: [] });
  createPlaybook.mockResolvedValue({ ok: true });
  setPlaybookMode.mockResolvedValue({ ok: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("PlaybooksTab", () => {
  it("⭐ dice lo esencial: responde sin una persona, empieza en ensayo y sólo toca el equipo de la alerta", async () => {
    render(<PlaybooksTab />);
    expect(await screen.findByText(/answers an alert without a person/)).toBeInTheDocument();
    expect(screen.getByText(/starts in rehearsal/)).toBeInTheDocument();
    expect(screen.getByText(/only ever touches the device the alert names/)).toBeInTheDocument();
  });

  it("⭐ cada playbook enseña qué dispara, qué hace y sus frenos", async () => {
    render(<PlaybooksTab />);
    const card = within(await screen.findByTestId(`pb-${PB.id}`));
    expect(card.getByText("Rehearsal")).toBeInTheDocument();
    expect(card.getByText(/When an alert opens from Security compliance \(medium or worse\)|When an alert opens from/)).toBeInTheDocument();
    expect(card.getByText(/Remediate the check in the alert \(apply\)/)).toBeInTheDocument();
    expect(card.getByText(/Up to 25 devices per run · 50 runs per day · 6 h cooldown per device · 3 today/)).toBeInTheDocument();
  });

  it("⚠️ armar pide confirmación y dice que a partir de ahí actúa sin preguntar", async () => {
    render(<PlaybooksTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Arm" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/acts on matching alerts without asking/));
    await waitFor(() => expect(setPlaybookMode).toHaveBeenCalledWith(PB.id, "armed"));
  });

  it("⭐ un playbook pausado por su tope diario lo dice en la fila", async () => {
    listPlaybooks.mockResolvedValue({ ok: true, playbooks: [{ ...PB, enabled: false, pausedReason: "daily cap of 50 runs reached" }] });
    render(<PlaybooksTab />);
    expect(await screen.findByTestId(`pb-paused-${PB.id}`)).toHaveTextContent("Paused on its own: daily cap of 50 runs reached");
  });

  it("las corridas traducen el freno que las paró", async () => {
    listPlaybookRuns.mockResolvedValue({
      ok: true,
      runs: [
        { id: 2, deviceId: "pc-2", decision: "skipped", skipReason: "cooldown:6h", actions: [], createdAt: new Date().toISOString() },
        { id: 1, deviceId: "pc-1", decision: "dry_run", skipReason: null, actions: [{ kind: "remediate", status: "planned", detail: "would apply win.edge" }], createdAt: new Date().toISOString() },
      ],
    });
    render(<PlaybooksTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Runs" }));
    const runs = within(await screen.findByTestId("pb-runs"));
    expect(runs.getByText(/Cooldown — this device was already handled in the last 6h/)).toBeInTheDocument();
    expect(runs.getByText("Would have acted")).toBeInTheDocument();
    expect(runs.getByText(/Remediate the check: planned \(would apply win.edge\)/)).toBeInTheDocument();
  });

  it("crear manda el disparador, la acción y los frenos, y avisa de que nace en ensayo", async () => {
    listPlaybooks.mockResolvedValue({ ok: true, playbooks: [] });
    const notify = vi.fn();
    render(<PlaybooksTab notify={notify} />);
    fireEvent.click(await screen.findByRole("button", { name: "New playbook" }));
    const form = within(screen.getByTestId("pb-form"));
    fireEvent.change(form.getByLabelText("Name"), { target: { value: "Fix Edge" } });
    fireEvent.click(form.getByText("File integrity"));
    fireEvent.click(form.getByRole("button", { name: "Create in rehearsal" }));
    await waitFor(() => expect(createPlaybook).toHaveBeenCalled());
    expect(createPlaybook.mock.calls[0][0]).toEqual({
      name: "Fix Edge",
      trigger: { event: "alert.opened", sources: ["file_integrity"], minSeverity: "medium", ruleIds: null },
      conditions: [],
      actions: [{ kind: "remediate", mode: "apply", checkId: null }],
      guards: { devicesPerTick: 25, runsPerDay: 50, cooldownHours: 6 },
    });
    expect(notify).toHaveBeenCalledWith("success", expect.stringMatching(/starts in rehearsal/));
  });

  it("no manda una pregunta que el catálogo rechaza", async () => {
    listPlaybooks.mockResolvedValue({ ok: true, playbooks: [] });
    render(<PlaybooksTab />);
    fireEvent.click(await screen.findByRole("button", { name: "New playbook" }));
    const form = within(screen.getByTestId("pb-form"));
    fireEvent.change(form.getByLabelText("Name"), { target: { value: "Ask" } });
    fireEvent.click(form.getByRole("button", { name: "Add action" }));
    fireEvent.click(form.getByRole("button", { name: "Create in rehearsal" }));
    expect(await screen.findByText(/Ask the device: Process name is required/)).toBeInTheDocument();
    expect(createPlaybook).not.toHaveBeenCalled();
  });
});
