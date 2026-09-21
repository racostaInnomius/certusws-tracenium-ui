// src/components/Alerts/SiemDestinationsDrawer.test.jsx
//
// ADR-0028 F2 — los destinos SIEM en la página de Alertas.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../../api/siem", () => ({
  listSiemDestinations: vi.fn(),
  createSiemDestination: vi.fn(),
  updateSiemDestination: vi.fn(),
  deleteSiemDestination: vi.fn(),
  testSiemDestination: vi.fn(),
}));
import {
  createSiemDestination,
  listSiemDestinations,
  testSiemDestination,
  updateSiemDestination,
} from "../../api/siem";
import SiemDestinationsDrawer from "./SiemDestinationsDrawer";

const DEST = {
  id: 7, kind: "splunk_hec", label: "SOC Splunk", url: "https://splunk.acme.com:8088/services/collector/event", enabled: true,
  sources: ["file_integrity"], minSeverity: "medium", includeResolved: true, lastDeliveryAt: new Date().toISOString(),
  lastStatus: "failed", lastHttpStatus: 503, lastError: "503: busy", consecutiveFailures: 2,
  nextAttemptAt: new Date(Date.now() + 120_000).toISOString(), eventsDelivered: 42, backlog: 3, createdAt: "2026-09-21T00:00:00.000Z",
};

beforeEach(() => {
  listSiemDestinations.mockResolvedValue({ ok: true, destinations: [DEST] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SiemDestinationsDrawer", () => {
  it("⭐ dice cómo se entrega sin que nadie pregunte: transiciones, al menos una vez, empieza ahora, 7 días", async () => {
    render(<SiemDestinationsDrawer onClose={() => {}} />);
    expect(await screen.findByText("SOC Splunk")).toBeInTheDocument();
    expect(screen.getByText(/not again every hour it stays open/)).toBeInTheDocument();
    expect(screen.getByText(/at least once and in order/)).toBeInTheDocument();
    expect(screen.getByText(/does not receive past alerts/)).toBeInTheDocument();
    expect(screen.getByText(/more than 7 days/)).toBeInTheDocument();
  });

  it("⭐ un destino que falla enseña el motivo, lo pendiente y cuándo reintenta", async () => {
    render(<SiemDestinationsDrawer onClose={() => {}} />);
    const card = within(await screen.findByTestId("siem-destination-7"));
    expect(card.getByText("Failing")).toBeInTheDocument();
    expect(card.getByText(/503: busy · retrying/)).toBeInTheDocument();
    expect(card.getByText(/42 events delivered/)).toBeInTheDocument();
    expect(card.getByText(/3 waiting/)).toBeInTheDocument();
  });

  it("alta: el secreto viaja al crear, y los filtros vacíos significan todas las fuentes", async () => {
    listSiemDestinations.mockResolvedValue({ ok: true, destinations: [] });
    createSiemDestination.mockResolvedValue({ ok: true });
    const notify = vi.fn();
    render(<SiemDestinationsDrawer onClose={() => {}} notify={notify} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add destination" }));
    const form = within(screen.getByTestId("siem-destination-form"));
    fireEvent.change(form.getByLabelText("Name"), { target: { value: "SOC" } });
    fireEvent.change(form.getByLabelText("URL (https)"), { target: { value: "https://siem.acme.com/hook" } });
    fireEvent.change(form.getByLabelText("Signing secret"), { target: { value: "s".repeat(32) } });
    fireEvent.click(form.getByRole("button", { name: "Add destination" }));
    await waitFor(() =>
      expect(createSiemDestination).toHaveBeenCalledWith({
        kind: "webhook", label: "SOC", url: "https://siem.acme.com/hook", secret: "s".repeat(32),
        minSeverity: "low", includeResolved: true, sources: null, enabled: true,
      })
    );
    expect(notify).toHaveBeenCalledWith("success", expect.stringMatching(/past alerts are not sent/));
  });

  it("⚠️ al editar, un secreto vacío NO se manda: se conserva el que había", async () => {
    updateSiemDestination.mockResolvedValue({ ok: true });
    render(<SiemDestinationsDrawer onClose={() => {}} />);
    fireEvent.click(within(await screen.findByTestId("siem-destination-7")).getByRole("button", { name: "Edit" }));
    const form = within(screen.getByTestId("siem-destination-form"));
    fireEvent.change(form.getByLabelText("Name"), { target: { value: "SOC Splunk (prod)" } });
    fireEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateSiemDestination).toHaveBeenCalled());
    expect(updateSiemDestination.mock.calls[0][1]).not.toHaveProperty("secret");
    expect(updateSiemDestination.mock.calls[0][1]).toMatchObject({ label: "SOC Splunk (prod)", sources: ["file_integrity"] });
  });

  it("la prueba dice si el receptor aceptó, y con qué error si no", async () => {
    testSiemDestination.mockResolvedValue({ ok: true, result: { ok: false, httpStatus: 403, error: "403: Invalid token" } });
    const notify = vi.fn();
    render(<SiemDestinationsDrawer onClose={() => {}} notify={notify} />);
    fireEvent.click(within(await screen.findByTestId("siem-destination-7")).getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", "Test failed: 403: Invalid token"));
  });
});
