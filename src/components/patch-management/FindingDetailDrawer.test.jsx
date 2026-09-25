// src/components/patch-management/FindingDetailDrawer.test.jsx
//
// El drawer por el que pasan los cuatro «Fix» (rejilla PMP, hub, «Fix now» de
// un equipo, «Fix N» de flota). Lo que se fija:
//   · en la selección hay DOS caminos y elige el operador: simular (lo
//     recomendado) o aplicar directo sobre lo seleccionado;
//   · tras simular, «Apply» va sólo a los que dijeron «would apply» — nunca a
//     la selección entera;
//   · una simulación ya hecha se puede reabrir en vez de repetirla;
//   · una acción agrupada lista la UNIÓN de equipos de sus checks;
//   · `initialDeviceIds` preselecciona sólo ésos.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("../../api/patchManagement", () => ({
  getDevicesAffectedByCheck: vi.fn(),
  remediate: vi.fn(),
  getRemediationResults: vi.fn(),
  cancelRemediation: vi.fn(),
  listRemediations: vi.fn(),
}));
vi.mock("./ActionOutlookNotice", () => ({ default: () => null }));

import { getDevicesAffectedByCheck, remediate, getRemediationResults, listRemediations } from "../../api/patchManagement";
import FindingDetailDrawer from "./FindingDetailDrawer";

const dev = (agentId) => ({ agentId, hostname: agentId.toUpperCase(), platform: "windows" });
const FINDING = { checkId: "fw.domain", title: "Firewall", severity: "high", agentRemediable: true };

beforeEach(() => {
  vi.clearAllMocks();
  getDevicesAffectedByCheck.mockImplementation(async (id) => ({
    items: id === "fw.private" ? [dev("d2"), dev("d3")] : [dev("d1"), dev("d2")],
  }));
  remediate.mockResolvedValue({ remediation: { id: 7 } });
  listRemediations.mockResolvedValue({ items: [] });
  getRemediationResults.mockResolvedValue({
    items: [
      { id: 1, deviceId: "d1", outcome: "dryrun_would_apply" },
      { id: 2, deviceId: "d2", outcome: "dryrun_already_compliant" },
      { id: 3, deviceId: "d3", outcome: "timed_out" },
    ],
  });
});
afterEach(cleanup);

const open = (props = {}) =>
  render(<FindingDetailDrawer open finding={FINDING} canManage notify={vi.fn()} onClose={vi.fn()} {...props} />);

describe("simular, luego aplicar", () => {
  it("⭐ el operador elige: simular o aplicar directo, los dos sobre lo seleccionado", async () => {
    // Obligar a simular convertía cada fix conocido en dos vueltas, y al
    // volver a entrar el cajón empezaba otra vez por la simulación.
    open();
    expect(await screen.findByRole("button", { name: /Dry-run on 2/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /^Apply on 2/ }));
    await waitFor(() => expect(remediate).toHaveBeenCalledTimes(1));
    expect(remediate.mock.calls[0][0]).toEqual({ checkId: "fw.domain", mode: "apply", deviceIds: ["d1", "d2"] });
  });

  it("⭐ una simulación ya hecha se reabre, no se repite", async () => {
    // Lo que vio el operador el 22-sep: simuló en dos equipos, el trabajo
    // salió «completed», y al volver a entrar desde Security Compliance el
    // cajón empezaba de cero, sin rastro de aquella simulación.
    listRemediations.mockResolvedValue({
      items: [
        { id: 41, mode: "apply", status: "completed", createdAt: "2026-09-22T10:00:00.000Z" },
        { id: 42, mode: "dry_run", status: "completed", createdAt: "2026-09-22T12:00:00.000Z" },
        { id: 40, mode: "dry_run", status: "completed", createdAt: "2026-09-21T09:00:00.000Z" },
      ],
    });
    open();
    const prev = await screen.findByTestId("last-dry-run");
    expect(prev).toHaveTextContent(/#42/);          // la más reciente, no la primera
    fireEvent.click(screen.getByRole("button", { name: /open its result/i }));

    // Entra en el progreso de ESA simulación y ofrece el apply acotado, sin
    // volver a lanzar nada.
    await waitFor(() => expect(getRemediationResults).toHaveBeenCalledWith(42));
    expect(await screen.findByRole("button", { name: /Apply on 1 device that would change/ })).toBeEnabled();
    expect(remediate).not.toHaveBeenCalled();
  });

  it("sin simulaciones previas no se inventa el aviso", async () => {
    open();
    await screen.findByRole("button", { name: /Dry-run on 2/ });
    expect(screen.queryByTestId("last-dry-run")).toBeNull();
  });

  it("⭐ Apply va sólo a los que la simulación dijo que cambiarían", async () => {
    open({ checkIds: ["fw.domain", "fw.private"] });
    fireEvent.click(await screen.findByRole("button", { name: /Dry-run on 3/ }));
    await waitFor(() => expect(remediate).toHaveBeenCalledTimes(1));
    expect(remediate.mock.calls[0][0]).toEqual({ checkId: "fw.domain", mode: "dry_run", deviceIds: ["d1", "d2", "d3"] });

    const apply = await screen.findByRole("button", { name: /Apply on 1 device that would change/ });
    expect(screen.getByText(/1 already compliant/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed or did not answer/)).toBeInTheDocument();
    fireEvent.click(apply);
    await waitFor(() => expect(remediate).toHaveBeenCalledTimes(2));
    expect(remediate.mock.calls[1][0]).toEqual({ checkId: "fw.domain", mode: "apply", deviceIds: ["d1"] });
  });

  it("mientras falte alguien por contestar, Apply no existe", async () => {
    getRemediationResults.mockResolvedValue({
      items: [
        { id: 1, deviceId: "d1", outcome: "dryrun_would_apply" },
        { id: 2, deviceId: "d2", outcome: "pending" },
      ],
    });
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Dry-run on 2/ }));
    expect(await screen.findByText(/Waiting for every device/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Apply/ })).toBeNull();
  });

  it("si nada cambiaría, Apply está pero apagado y lo dice", async () => {
    getRemediationResults.mockResolvedValue({ items: [{ id: 1, deviceId: "d1", outcome: "dryrun_already_compliant" }] });
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Dry-run on 2/ }));
    expect(await screen.findByRole("button", { name: /Apply on 0 devices/ })).toBeDisabled();
    expect(screen.getByText(/Nothing to apply/)).toBeInTheDocument();
  });

  it("initialDeviceIds preselecciona sólo ése", async () => {
    open({ initialDeviceIds: ["d2"] });
    expect(await screen.findByRole("button", { name: /Dry-run on 1/ })).toBeEnabled();
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
  });

  it("sin permiso no se simula", async () => {
    open({ canManage: false });
    expect(await screen.findByRole("button", { name: /Dry-run on 2/ })).toBeDisabled();
  });

  it("el aviso del llamante se enseña encima del botón", async () => {
    open({ notice: <div>domain-joined warning</div> });
    expect(await screen.findByText("domain-joined warning")).toBeInTheDocument();
  });
});

// ── El fix ya está en camino ──────────────────────────────────────
// 25-sep: «Weak SCHANNEL ciphers» seguía en dos equipos con su job en
// `pending` y el cajón ofrecía «Apply» otra vez sin decir nada.
describe("equipos a los que el fix ya les está llegando", () => {
  const busy = (agentId, remediationId = 17, outcome = "pending") => ({
    ...dev(agentId),
    inFlight: { deviceId: agentId, remediationId, outcome, createdAt: "2026-09-25T10:00:00.000Z" },
  });

  it("⭐ se ven en su fila con la remediación, fuera de la selección y sin poder marcarlos", async () => {
    getDevicesAffectedByCheck.mockResolvedValue({ items: [dev("d1"), busy("d2")] });
    open();
    expect(await screen.findByRole("button", { name: /^Apply on 1/ })).toBeEnabled();
    expect(screen.getByText("Pending · #17")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select D2" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select D2" })).not.toBeChecked();
    expect(screen.getByTestId("in-flight-notice")).toHaveTextContent(/1 of 2 devices already have this fix on its way \(#17\)/);

    // Ni pulsando la fila entra.
    fireEvent.click(screen.getByTestId("affected-d2"));
    fireEvent.click(screen.getByRole("button", { name: /^Apply on 1/ }));
    await waitFor(() => expect(remediate).toHaveBeenCalledTimes(1));
    expect(remediate.mock.calls[0][0].deviceIds).toEqual(["d1"]);
  });

  it("si todos lo tienen ya en camino, no hay nada que mandar y se dice", async () => {
    getDevicesAffectedByCheck.mockResolvedValue({ items: [busy("d1"), busy("d2", 18, "running")] });
    open();
    expect(await screen.findByRole("button", { name: /^Apply on 0/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Dry-run on 0/ })).toBeDisabled();
    expect(screen.getByText("Running · #18")).toBeInTheDocument();
    expect(screen.getByTestId("in-flight-notice")).toHaveTextContent(/already on its way to all 2 devices \(#17, #18\)/);
    // «Seleccionar todo» no los mete por la puerta de atrás.
    expect(screen.getByRole("checkbox", { name: "Select all devices" })).toBeDisabled();
  });

  it("el chip abre esa remediación, donde se sigue o se cancela", async () => {
    getDevicesAffectedByCheck.mockResolvedValue({ items: [busy("d1")] });
    getRemediationResults.mockResolvedValue({ items: [{ id: 9, deviceId: "d1", outcome: "pending" }] });
    open();
    fireEvent.click(await screen.findByText("Pending · #17"));
    await waitFor(() => expect(getRemediationResults).toHaveBeenCalledWith(17));
    expect(await screen.findByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(remediate).not.toHaveBeenCalled();
  });

  it("una acción agrupada lo hereda de cualquiera de sus checks", async () => {
    getDevicesAffectedByCheck.mockImplementation(async (id) => ({
      items: id === "fw.private" ? [busy("d2")] : [dev("d1"), dev("d2")],
    }));
    open({ checkIds: ["fw.domain", "fw.private"] });
    expect(await screen.findByText("Pending · #17")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Apply on 1/ })).toBeEnabled();
  });

  it("si el backend quitó a alguien por una carrera, lo dice", async () => {
    const notify = vi.fn();
    remediate.mockResolvedValue({ remediation: { id: 7, skippedInFlight: [{ deviceId: "d2", remediationId: 17, outcome: "pending" }] } });
    open({ notify });
    fireEvent.click(await screen.findByRole("button", { name: /^Apply on 2/ }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("info", expect.stringMatching(/1 device was left out/)));
  });
});
