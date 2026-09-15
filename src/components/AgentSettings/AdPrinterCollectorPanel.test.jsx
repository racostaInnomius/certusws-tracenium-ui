// src/components/AgentSettings/AdPrinterCollectorPanel.test.jsx
//
// ADR-0023 F2 — el panel del colector de impresoras de AD, con las formas reales
// de T111 (MSIG-WSUS como servidor, MsigPrint con un agente anterior).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/adPrinters", () => ({
  getAdPrintersStatus: vi.fn(),
  listAdPrinterCandidates: vi.fn(),
  setAdPrinterCollector: vi.fn(),
  clearAdPrinterCollector: vi.fn(),
  runAdPrintersNow: vi.fn(),
}));
const confirmMock = vi.fn(async () => true);
vi.mock("../common/ConfirmDialog", () => ({ useConfirm: () => confirmMock }));

import * as api from "../../api/adPrinters";
import AdPrinterCollectorPanel from "./AdPrinterCollectorPanel";
import PolicySectionPanel from "./PolicySectionPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CANDIDATES = {
  candidates: [
    { deviceId: "wsus", hostname: "MSIG-WSUS", agentVersion: "1.1.73", supported: true, online: true },
    { deviceId: "print", hostname: "MsigPrint", agentVersion: "1.1.72", supported: false, online: false },
  ],
};

const NONE = { collector: null, minAgentVersion: "1.1.73", runs: [], domains: [] };
const WITH = {
  collector: { primaryDeviceId: "wsus", secondaryDeviceId: "print" },
  minAgentVersion: "1.1.73",
  runs: [
    { runId: "r2", status: "missed", error: "collector_unavailable", startedAt: new Date().toISOString() },
    { runId: "r1", status: "complete", deviceId: "wsus", domain: "mountainside-investment.com", dcUsed: "MSIG-DOMAIN01", queuesCount: 21, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() },
  ],
  domains: [{ domain: "mountainside-investment.com", queues: 21 }],
};

describe("AdPrinterCollectorPanel", () => {
  it("sin colector: ofrece los Windows con lo que les impide correr, y guarda", async () => {
    api.getAdPrintersStatus.mockResolvedValueOnce(NONE).mockResolvedValue(WITH);
    api.listAdPrinterCandidates.mockResolvedValue(CANDIDATES);
    api.setAdPrinterCollector.mockResolvedValue({ collector: WITH.collector });
    render(<AdPrinterCollectorPanel />);

    const primary = await screen.findByLabelText("Primary device");
    fireEvent.mouseDown(primary);
    expect(await screen.findByText("MsigPrint · agent 1.1.72, needs 1.1.73 · offline")).toBeTruthy();
    fireEvent.click(screen.getByText("MSIG-WSUS"));

    fireEvent.click(screen.getByRole("button", { name: "Save collector" }));
    await waitFor(() => expect(api.setAdPrinterCollector).toHaveBeenCalledWith({ primaryDeviceId: "wsus", secondaryDeviceId: null }));
    expect(await screen.findByText(/Collector saved/)).toBeTruthy();
  });

  it("⭐ con colector: estado de cada equipo, la última lectura buena aunque la reciente fallara, y por qué falló", async () => {
    api.getAdPrintersStatus.mockResolvedValue(WITH);
    api.listAdPrinterCandidates.mockResolvedValue(CANDIDATES);
    render(<AdPrinterCollectorPanel />);

    expect(await screen.findByText(/21 print queues published in mountainside-investment.com/)).toBeTruthy();
    expect(screen.getByText("Agent update needed")).toBeTruthy();
    expect(screen.getByText("Offline")).toBeTruthy();
    expect(screen.getByText("Missed")).toBeTruthy();
    expect(screen.getByText("No collector device was online.")).toBeTruthy();
    expect(screen.getByText("21 queues · mountainside-investment.com · via MSIG-DOMAIN01")).toBeTruthy();
  });

  it("⚠️ Run now sin nadie online lo dice, y recarga para que se vea la corrida perdida", async () => {
    api.getAdPrintersStatus.mockResolvedValue(WITH);
    api.listAdPrinterCandidates.mockResolvedValue(CANDIDATES);
    api.runAdPrintersNow.mockRejectedValue({ body: { error: "AD_PRINTERS_COLLECTOR_UNAVAILABLE" } });
    render(<AdPrinterCollectorPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Run now" }));
    expect(await screen.findByText(/Neither the primary nor the backup device is online/)).toBeTruthy();
    await waitFor(() => expect(api.getAdPrintersStatus.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("quitar el colector pide confirmación", async () => {
    api.getAdPrintersStatus.mockResolvedValue(WITH);
    api.listAdPrinterCandidates.mockResolvedValue(CANDIDATES);
    api.clearAdPrinterCollector.mockResolvedValue(null);
    render(<AdPrinterCollectorPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.clearAdPrinterCollector).toHaveBeenCalled());
    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
  });

  it("sin ningún Windows en la flota lo dice en vez de un selector vacío", async () => {
    api.getAdPrintersStatus.mockResolvedValue(NONE);
    api.listAdPrinterCandidates.mockResolvedValue({ candidates: [] });
    render(<AdPrinterCollectorPanel />);
    expect(await screen.findByText(/no Windows device in this fleet/)).toBeTruthy();
  });
});

describe("PolicySectionPanel — dónde aparece", () => {
  const section = { id: "amp", label: "Asset Management", plugin: "amp", description: "d" };
  it("⚠️ sólo en la sección Asset Management y en ámbito tenant", async () => {
    api.getAdPrintersStatus.mockResolvedValue(NONE);
    api.listAdPrinterCandidates.mockResolvedValue(CANDIDATES);
    const { rerender } = render(<PolicySectionPanel section={section} form={{}} onChange={() => {}} scope="tenant" />);
    expect(await screen.findByTestId("ad-printer-collector-panel")).toBeTruthy();

    rerender(<PolicySectionPanel section={section} form={{}} onChange={() => {}} scope="device" compareForm={{}} />);
    expect(screen.queryByTestId("ad-printer-collector-panel")).toBeNull();

    rerender(<PolicySectionPanel section={{ ...section, id: "scp", plugin: "scp" }} form={{}} onChange={() => {}} scope="tenant" />);
    expect(screen.queryByTestId("ad-printer-collector-panel")).toBeNull();
  });
});
