import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SoftwareInsightCards from "./SoftwareInsightCards";

afterEach(cleanup);

// Forma real de GET /software-inventory/insights (T111, 29-sep, recortada).
const INSIGHTS = {
  fleetDevices: 57,
  vulnerable: { affectedDevices: 25, critical: 234, high: 1056, knownExploited: 9, kevOverdue: 9, notEvaluableCves: 2980 },
  vulnerableUnavailable: null,
  remoteAccess: {
    tools: [
      { key: "rustdesk", label: "RustDesk", authorized: false, devices: 6, hosts: ["PC-1", "PC-2"] },
      { key: "anydesk", label: "AnyDesk", authorized: false, devices: 4, hosts: ["PC-3"] },
      { key: "logmein", label: "LogMeIn / GoTo Resolve", authorized: true, devices: 42, hosts: ["PC-1"] },
    ],
    unauthorizedDevices: 13,
    authorizedKeys: ["logmein"],
    settingsAvailable: true,
  },
  rareApps: {
    apps: 629,
    singleDevice: 503,
    devices: 44,
    maxDevices: 2,
    items: [
      { label: "OneLaunch 5.31.2", hosts: ["PC-7"], firstSeenAt: "2026-09-20T10:00:00Z" },
      { label: "ABB RobotStudio 2021.3.1", hosts: ["PC-8", "PC-9"], firstSeenAt: "2026-09-10T10:00:00Z" },
    ],
  },
  freshness: {
    fleetDevices: 56,
    upToDate: 54,
    staleAfterDays: 7,
    stale: [
      { agentId: "a-1", hostname: "DESKTOP-CAS-AV2", lastReportedAt: "2026-09-15T18:19:51Z" },
      { agentId: "a-2", hostname: "NEVER-PC", lastReportedAt: null },
    ],
  },
};

const mount = (props = {}) => render(<SoftwareInsightCards insights={INSIGHTS} {...props} />);

describe("SoftwareInsightCards", () => {
  it("⭐ cada tarjeta responde su pregunta con la cifra que importa", () => {
    mount();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("of 57 devices")).toBeInTheDocument();
    expect(screen.getByText("9 actively exploited (KEV) — all past due")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("RustDesk · 6")).toBeInTheDocument();
    // Lo autorizado se dice, pero no es un chip de alarma.
    expect(screen.queryByText("LogMeIn / GoTo Resolve · 42")).toBeNull();
    expect(screen.getByText(/LogMeIn \/ GoTo Resolve \(42\) is authorized and not counted/)).toBeInTheDocument();
    expect(screen.getByText("629")).toBeInTheDocument();
    expect(screen.getByText("54")).toBeInTheDocument();
    expect(screen.getByText("NEVER-PC · never reported")).toBeInTheDocument();
  });

  it("sin Patch Management lo dice, en vez de un cero", () => {
    mount({ insights: { ...INSIGHTS, vulnerable: null, vulnerableUnavailable: "not_entitled" } });
    expect(screen.getByText(/measured by Patch Management, which this tenant doesn't have/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open Vulnerabilities/ })).toBeNull();
  });

  it("«Open Vulnerabilities» lleva a la exposición", () => {
    const onOpenVulnerabilities = vi.fn();
    mount({ onOpenVulnerabilities });
    fireEvent.click(screen.getByRole("button", { name: /Open Vulnerabilities/ }));
    expect(onOpenVulnerabilities).toHaveBeenCalled();
  });

  it("⭐ un admin marca una herramienta como autorizada y se guarda la lista entera", async () => {
    const onSaveAuthorized = vi.fn().mockResolvedValue(undefined);
    mount({ canAdminister: true, onSaveAuthorized });
    fireEvent.click(screen.getByRole("button", { name: /See devices/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("RustDesk is authorized"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaveAuthorized).toHaveBeenCalled());
    expect([...onSaveAuthorized.mock.calls[0][0]].sort()).toEqual(["logmein", "rustdesk"]);
  });

  it("quien no administra ve la lista pero no puede cambiarla", async () => {
    mount({ canAdminister: false });
    fireEvent.click(screen.getByRole("button", { name: /See devices/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("AnyDesk is authorized")).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(dialog).getByText(/Only tenant admins and owners/)).toBeInTheDocument();
  });

  it("sin la tabla de ajustes en el servidor, lo avisa y no deja guardar", async () => {
    mount({ canAdminister: true, insights: { ...INSIGHTS, remoteAccess: { ...INSIGHTS.remoteAccess, settingsAvailable: false } } });
    fireEvent.click(screen.getByRole("button", { name: /See devices/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/isn't available on this server yet/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("la lista de apps raras se busca por app o por equipo", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Review the list/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search rare apps" }), { target: { value: "pc-9" } });
    expect(within(dialog).getByText("ABB RobotStudio 2021.3.1")).toBeInTheDocument();
    expect(within(dialog).queryByText("OneLaunch 5.31.2")).toBeNull();
  });

  it("⭐ un equipo sin reportar abre su ficha", async () => {
    const onOpenDevice = vi.fn();
    mount({ onOpenDevice });
    fireEvent.click(screen.getByRole("button", { name: /See the 2 devices/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "DESKTOP-CAS-AV2" }));
    expect(onOpenDevice).toHaveBeenCalledWith("a-1");
  });
});
