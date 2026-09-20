// src/components/discovery/CoveragePanel.test.jsx
//
// Cobertura en Asset Management: qué enseña, qué deja hacer y qué NO deja.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../../api/discovery", () => ({
  getCoverage: vi.fn(),
  runDiscoveryNow: vi.fn(),
  setDiscoveryInstallState: vi.fn(),
  getDiscoveryInstallPackage: vi.fn(),
}));
import {
  getCoverage,
  getDiscoveryInstallPackage,
  runDiscoveryNow,
  setDiscoveryInstallState,
} from "../../api/discovery";
import CoveragePanel from "./CoveragePanel";

const NOW = Date.now();
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();

const device = (over) => ({
  source: "ad",
  sourceKey: `guid-${over.hostname}`,
  hostname: over.hostname,
  dnsHostName: null,
  dnsHostname: `${over.hostname}.acme.local`,
  os: "Windows 11 Pro",
  lastLogonUtc: daysAgo(3),
  passwordLastSetUtc: daysAgo(6),
  state: "active",
  matchedAgentId: null,
  installState: "discovered",
  installNote: null,
  ...over,
});

const DATA = {
  ok: true,
  available: true,
  summary: { total: 5, managed: 1, gap: 2, invited: 1, ignored: 1, byState: { active: 4, dormant: 0, stale: 1, disabled: 0 } },
  devices: [
    device({ hostname: "pc-ventas" }),
    device({ hostname: "pc-recepcion" }),
    device({ hostname: "pc-ana", matchedAgentId: "agent-1", installState: "installed" }),
    device({ hostname: "pc-invitado", installState: "invited" }),
    device({ hostname: "plantilla-vdi", installState: "ignored", installNote: "plantilla de VDI", state: "stale", lastLogonUtc: daysAgo(400), passwordLastSetUtc: daysAgo(400) }),
  ],
  runs: [{ runId: "r1", status: "complete", foundCount: 5, domain: "acme.local", startedAt: daysAgo(0), error: null }],
};

beforeEach(() => {
  getCoverage.mockResolvedValue(DATA);
  runDiscoveryNow.mockResolvedValue({ ok: true });
  setDiscoveryInstallState.mockResolvedValue({ ok: true, changed: 1 });
  getDiscoveryInstallPackage.mockResolvedValue({
    ok: true,
    package: {
      msiUrl: "https://dl/Tracenium-Agent.msi",
      msiVersion: "1.1.78",
      command: "msiexec /i Tracenium-Agent.msi /qn ENROLLMENT_TOKEN=abc123",
      gpoScript: "# guion\nInvoke-WebRequest ...",
      intuneInstallCommand: "msiexec /i Tracenium-Agent.msi /qn ENROLLMENT_TOKEN=abc123",
      token: "abc123",
      tokenExpiresAt: new Date(NOW + 30 * 86_400_000).toISOString(),
      devices: ["pc-ventas", "pc-recepcion"],
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CoveragePanel", () => {
  it("⭐ empieza enseñando lo que falta: el hueco primero y sólo los equipos sin agente", async () => {
    render(<CoveragePanel canManage />);
    expect(await screen.findByText("Without agent")).toBeInTheDocument();
    // El hueco (2) va delante del total de objetos de AD (5).
    const values = screen.getAllByText(/^\d+$/).map((n) => n.textContent);
    expect(values[0]).toBe("2");
    expect(screen.getByText("pc-ventas")).toBeInTheDocument();
    // Con agente e ignorado no son trabajo pendiente: fuera de la vista inicial.
    expect(screen.queryByText("pc-ana")).not.toBeInTheDocument();
    expect(screen.queryByText("plantilla-vdi")).not.toBeInTheDocument();
    expect(screen.getByText(/5 computer objects read from acme.local/)).toBeInTheDocument();
  });

  it("al enseñarlo todo aparecen los que ya tienen agente y los descartados, con su motivo", async () => {
    render(<CoveragePanel canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Showing what is missing" }));
    expect(screen.getByText("pc-ana")).toBeInTheDocument();
    // La tarjeta del resumen y el chip de la fila dicen lo mismo; basta con la fila.
    expect(within(screen.getByText("pc-ana").closest("tr")).getByText("With agent")).toBeInTheDocument();
    expect(within(screen.getByText("plantilla-vdi").closest("tr")).getByText("Never install")).toBeInTheDocument();
    // Un equipo con agente no se puede seleccionar: no hay nada que instalarle.
    const managed = within(screen.getByText("pc-ana").closest("tr"));
    expect(managed.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("⭐ el paquete de instalación sale con los seleccionados y avisa de que el código se enseña una vez", async () => {
    render(<CoveragePanel canManage />);
    await screen.findByText("pc-ventas");
    // Un equipo «invitado» sigue sin agente, así que también es trabajo
    // pendiente y entra en la selección.
    fireEvent.click(screen.getByLabelText("Select every computer without an agent"));
    fireEvent.click(screen.getByRole("button", { name: /Get install package \(3\)/ }));

    await waitFor(() => expect(getDiscoveryInstallPackage).toHaveBeenCalledWith([
      { source: "ad", sourceKey: "guid-pc-ventas" },
      { source: "ad", sourceKey: "guid-pc-recepcion" },
      { source: "ad", sourceKey: "guid-pc-invitado" },
    ]));
    expect(await screen.findByText("Install the agent on 2 devices")).toBeInTheDocument();
    expect(screen.getByText(/shown/)).toBeInTheDocument();
    expect(screen.getByText(/ENROLLMENT_TOKEN=abc123/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for: pc-ventas, pc-recepcion/)).toBeInTheDocument();
  });

  it("«Never install» marca los seleccionados y recarga", async () => {
    render(<CoveragePanel canManage />);
    await screen.findByText("pc-ventas");
    fireEvent.click(screen.getByLabelText("Select pc-ventas"));
    fireEvent.click(screen.getByRole("button", { name: "Never install" }));
    await waitFor(() => expect(setDiscoveryInstallState).toHaveBeenCalledWith([{ source: "ad", sourceKey: "guid-pc-ventas" }], "ignored"));
    expect(getCoverage).toHaveBeenCalledTimes(2);
  });

  it("⚠️ sin colector elegido, «Look now» explica dónde se elige en vez de un código de error", async () => {
    runDiscoveryNow.mockRejectedValue({ body: { error: "DISCOVERY_NO_COLLECTOR" } });
    render(<CoveragePanel canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Look now" }));
    expect(await screen.findByText(/Choose the device that reads Active Directory first/)).toBeInTheDocument();
  });

  it("⚠️ una lectura fallida dice que la lista anterior se conserva", async () => {
    getCoverage.mockResolvedValue({ ...DATA, runs: [{ runId: "r2", status: "missed", startedAt: daysAgo(0) }] });
    render(<CoveragePanel canManage />);
    expect(await screen.findByText(/collector was offline.*previous list is kept/)).toBeInTheDocument();
  });

  it("sin permiso no hay acciones, y sin la migración lo dice en vez de enseñar un cero", async () => {
    render(<CoveragePanel />);
    await screen.findByText("pc-ventas");
    expect(screen.queryByRole("button", { name: "Look now" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Select pc-ventas")).not.toBeInTheDocument();

    cleanup();
    getCoverage.mockResolvedValue({ ok: true, available: false, summary: null, devices: [], runs: [] });
    render(<CoveragePanel canManage />);
    expect(await screen.findByText(/not enabled on this server yet/)).toBeInTheDocument();
  });
});
