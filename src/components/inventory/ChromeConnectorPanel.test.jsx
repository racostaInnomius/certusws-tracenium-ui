// src/components/inventory/ChromeConnectorPanel.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/inventoryDashboard", () => ({
  getChromeConnector: vi.fn(),
  putChromeConnector: vi.fn(),
  deleteChromeConnector: vi.fn(),
}));
import { deleteChromeConnector, getChromeConnector, putChromeConnector } from "../../api/inventoryDashboard";
import ChromeConnectorPanel from "./ChromeConnectorPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SA = "chrome-push@acme-sec.iam.gserviceaccount.com";
const base = { kind: "chrome_pubsub", endpointUrl: null, pushServiceAccount: SA, enabled: true, createdAt: "2026-09-14T09:00:00Z", createdBy: "sub", messagesReceived: 0, eventsReceived: 0, eventsCorrelated: 0, lastMessageAt: null, lastError: null, lastErrorAt: null };

describe("ChromeConnectorPanel", () => {
  it("sin conector: estado, pasos de configuración y el endpoint se enseña UNA vez tras crearlo", async () => {
    getChromeConnector.mockResolvedValue({ ok: true, connector: null });
    putChromeConnector.mockResolvedValue({ ok: true, endpointUrl: "https://api.tracenium.com/api/v1/ingest/chrome/TOKEN", connector: base });
    const notify = vi.fn();
    render(<ChromeConnectorPanel canManage notify={notify} />);
    expect(await screen.findByText("Not configured")).toBeInTheDocument();
    expect(screen.getByText(/cloud-pub-sub-publisher@chrome-reporting.iam.gserviceaccount.com/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Push subscription service account"), { target: { value: ` ${SA} ` } });
    fireEvent.click(screen.getByRole("button", { name: "Create endpoint" }));
    await waitFor(() => expect(putChromeConnector).toHaveBeenCalledWith(SA));
    expect(await screen.findByText("https://api.tracenium.com/api/v1/ingest/chrome/TOKEN")).toBeInTheDocument();
    expect(screen.getByText("Push endpoint — shown only now")).toBeInTheDocument();
    expect(screen.getByText("Waiting for the first event")).toBeInTheDocument();
  });

  it("recibiendo: último evento, porcentaje correlado y el último error si es posterior", async () => {
    getChromeConnector.mockResolvedValue({
      ok: true,
      connector: { ...base, lastMessageAt: "2026-09-14T10:00:00Z", eventsReceived: 40, eventsCorrelated: 30, lastError: "2 event(s) in message m-9 could not be read", lastErrorAt: "2026-09-14T10:00:00Z" },
    });
    render(<ChromeConnectorPanel />);
    expect(await screen.findByText("Receiving, with errors")).toBeInTheDocument();
    expect(screen.getByText("40 events · 75% matched to a device")).toBeInTheDocument();
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
    // Sin capacidad: sin formulario, con el motivo.
    expect(screen.queryByLabelText("Push subscription service account")).not.toBeInTheDocument();
    expect(screen.getByText(/needs the Security Compliance capability/)).toBeInTheDocument();
  });

  it("un error al crear se notifica con el mensaje del servidor; quitar el conector recarga", async () => {
    getChromeConnector.mockResolvedValueOnce({ ok: true, connector: { ...base, lastMessageAt: "2026-09-14T10:00:00Z" } }).mockResolvedValue({ ok: true, connector: null });
    putChromeConnector.mockRejectedValue(Object.assign(new Error("x"), { body: { message: "Enter the service account the Pub/Sub push subscription authenticates as" } }));
    deleteChromeConnector.mockResolvedValue({ ok: true });
    const notify = vi.fn();
    render(<ChromeConnectorPanel canManage notify={notify} />);
    await screen.findByText("Receiving");
    fireEvent.change(screen.getByLabelText("Push subscription service account"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Create a new endpoint" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", expect.stringMatching(/service account/)));
    fireEvent.click(screen.getByRole("button", { name: "Remove connector" }));
    expect(await screen.findByText("Not configured")).toBeInTheDocument();
  });
});
