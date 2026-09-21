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
import { destinationBody } from "./siemDestinationModel";

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
        minSeverity: "low", includeResolved: true, sources: null, enabled: true, auditScope: "off",
      })
    );
    expect(notify).toHaveBeenCalledWith("success", expect.stringMatching(/past alerts and audit entries are not sent/));
  });

  it("⚠️ al editar, un secreto vacío NO se manda: se conserva el que había", async () => {
    updateSiemDestination.mockResolvedValue({ ok: true });
    render(<SiemDestinationsDrawer onClose={() => {}} />);
    fireEvent.click(within(await screen.findByTestId("siem-destination-7")).getByRole("button", { name: "Edit" }));
    const form = within(screen.getByTestId("siem-destination-form"));
    fireEvent.change(form.getByLabelText("Name"), { target: { value: "SOC Splunk (prod)" } });
    fireEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateSiemDestination).toHaveBeenCalled());
    // Sólo lo que cambió: ni secreto, ni URL, ni filtros.
    expect(updateSiemDestination.mock.calls[0][1]).toEqual({ label: "SOC Splunk (prod)" });
  });

  it("la prueba dice si el receptor aceptó, y con qué error si no", async () => {
    testSiemDestination.mockResolvedValue({ ok: true, result: { ok: false, httpStatus: 403, error: "403: Invalid token" } });
    const notify = vi.fn();
    render(<SiemDestinationsDrawer onClose={() => {}} notify={notify} />);
    fireEvent.click(within(await screen.findByTestId("siem-destination-7")).getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", "Test failed: 403: Invalid token"));
  });

  it("⭐ Sentinel pide tenant, app, DCR y stream, y los manda como config", async () => {
    listSiemDestinations.mockResolvedValue({ ok: true, destinations: [], canExportAudit: true });
    createSiemDestination.mockResolvedValue({ ok: true });
    render(<SiemDestinationsDrawer onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add destination" }));
    const form = within(screen.getByTestId("siem-destination-form"));
    fireEvent.mouseDown(form.getByLabelText("Destination type"));
    fireEvent.click(await screen.findByRole("option", { name: "Microsoft Sentinel" }));
    expect(form.getByText(/Monitoring Metrics Publisher/)).toBeInTheDocument();
    fireEvent.change(form.getByLabelText("Name"), { target: { value: "Sentinel" } });
    fireEvent.change(form.getByLabelText("Directory (tenant) ID"), { target: { value: "11111111-2222-3333-4444-555555555555" } });
    fireEvent.change(form.getByLabelText("Application (client) ID"), { target: { value: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } });
    fireEvent.change(form.getByLabelText("DCR immutable ID"), { target: { value: "dcr-0123456789abcdef0123456789abcdef" } });
    fireEvent.change(form.getByLabelText("Ingestion endpoint (https)"), { target: { value: "https://x.eastus-1.ingest.monitor.azure.com" } });
    fireEvent.change(form.getByLabelText("Client secret"), { target: { value: "c".repeat(40) } });
    fireEvent.click(form.getByRole("button", { name: "Add destination" }));
    await waitFor(() => expect(createSiemDestination).toHaveBeenCalled());
    expect(createSiemDestination.mock.calls[0][0]).toMatchObject({
      kind: "sentinel",
      url: "https://x.eastus-1.ingest.monitor.azure.com",
      secret: "c".repeat(40),
      config: {
        azureTenantId: "11111111-2222-3333-4444-555555555555",
        clientId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        dcrImmutableId: "dcr-0123456789abcdef0123456789abcdef",
        streamName: "Custom-TraceniumEvents_CL",
      },
    });
  });

  it("⚠️ sin permiso de audit log, el selector de auditoría está apagado y dice por qué", async () => {
    listSiemDestinations.mockResolvedValue({ ok: true, destinations: [], canExportAudit: false });
    render(<SiemDestinationsDrawer onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add destination" }));
    const form = within(screen.getByTestId("siem-destination-form"));
    expect(form.getByText(/needs the audit log permission/)).toBeInTheDocument();
    expect(form.getByLabelText("Audit trail").closest(".MuiInputBase-root")).toHaveClass("Mui-disabled");
  });

  it("con permiso, la auditoría se elige por carril y la tarjeta dice qué recibe y cuánto espera", async () => {
    listSiemDestinations.mockResolvedValue({
      ok: true,
      canExportAudit: true,
      destinations: [{ ...DEST, auditScope: "admin_and_failures", auditBacklog: 4 }],
    });
    createSiemDestination.mockResolvedValue({ ok: true });
    render(<SiemDestinationsDrawer onClose={() => {}} />);
    expect(await screen.findByTestId("siem-destination-7-audit")).toHaveTextContent("Audit trail: actions by people + anything that failed · 4 waiting");

    fireEvent.click(screen.getByRole("button", { name: "Add destination" }));
    const form = within(screen.getByTestId("siem-destination-form"));
    expect(form.getByText(/severity filter above does not apply here/)).toBeInTheDocument();
    fireEvent.mouseDown(form.getByLabelText("Audit trail"));
    fireEvent.click(await screen.findByRole("option", { name: "Actions by people" }));
    fireEvent.change(form.getByLabelText("Name"), { target: { value: "SOC" } });
    fireEvent.change(form.getByLabelText("URL (https)"), { target: { value: "https://siem.acme.com/hook" } });
    fireEvent.change(form.getByLabelText("Signing secret"), { target: { value: "s".repeat(32) } });
    fireEvent.click(form.getByRole("button", { name: "Add destination" }));
    await waitFor(() => expect(createSiemDestination).toHaveBeenCalled());
    expect(createSiemDestination.mock.calls[0][0]).toMatchObject({ auditScope: "admin" });
  });
});

describe("destinationBody", () => {
  const base = { kind: "sentinel", label: "S", url: "https://x.eastus-1.ingest.monitor.azure.com", secret: "", minSeverity: "low", includeResolved: true, sources: [], enabled: true, auditScope: "admin", config: { azureTenantId: "t", clientId: "c", dcrImmutableId: "d", streamName: "Custom-X" } };

  it("⚠️ editar sólo el nombre de un destino que exporta auditoría no manda URL ni config (pedirían audit_log)", () => {
    expect(destinationBody({ ...base, label: "S2" }, base, 7)).toEqual({ label: "S2" });
  });

  it("cambiar un campo de la config manda la config entera", () => {
    const body = destinationBody({ ...base, config: { ...base.config, streamName: "Custom-Y" } }, base, 7);
    expect(body).toEqual({ config: { ...base.config, streamName: "Custom-Y" } });
  });
});

