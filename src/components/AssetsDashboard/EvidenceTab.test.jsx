// src/components/AssetsDashboard/EvidenceTab.test.jsx
//
// ADR-0032 F3 — la pestaña de evidencia.
//
// ⚠️ Este fichero existe sobre todo por los dos PERMISOS: el backend los exige
// por separado, y una pantalla que enseñe el botón de descargar a quien no
// puede descargar convierte un permiso en un 403 con forma de bug.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({
  getEvidenceCollectors: vi.fn(),
  createEvidenceCapture: vi.fn(),
  listEvidenceCaptures: vi.fn(),
  getEvidenceCapture: vi.fn(),
  setEvidenceHold: vi.fn(),
  deleteEvidenceCapture: vi.fn(),
  evidenceArtifactUrl: (id, name) => `/api/v1/evidence/${id}/artifacts/${name}`,
}));
vi.mock("../../api/evidence", () => api);

import EvidenceTab from "./EvidenceTab";

const CAPTURE = {
  captureId: "cap-1",
  deviceId: "dev-1",
  status: "partial",
  trigger: "manual",
  reason: "no da escritorio",
  requestedBy: "user:35",
  artifactCount: 2,
  totalBytes: 2048,
  capturedAtUtc: "2026-09-23T12:52:00.000Z",
  deviceUtcOffsetMinutes: -300,
  deviceTimeZone: "America/Chicago",
  heldReason: null,
};

const DETAIL = {
  ...CAPTURE,
  artifacts: [
    { name: "sessions.txt", collector: "sessions", label: "Sessions", bytes: 1024, sha256: "a".repeat(64), status: "ok", detail: null },
    { name: "security.evtx", collector: "event_logs", label: "Event logs", bytes: 0, sha256: null, status: "failed", detail: "access denied" },
  ],
};

beforeEach(() => {
  Object.values(api).forEach((f) => typeof f?.mockReset === "function" && f.mockReset());
  api.getEvidenceCollectors.mockResolvedValue({
    collectors: [
      { key: "sessions", label: "Sessions", what: "…", platforms: ["windows"], volatile: true },
      { key: "event_logs", label: "Event logs", what: "…", platforms: ["windows"], volatile: false },
    ],
  });
  api.listEvidenceCaptures.mockResolvedValue({ captures: [CAPTURE] });
  api.getEvidenceCapture.mockResolvedValue({ capture: DETAIL });
});
afterEach(cleanup);

describe("EvidenceTab — permisos", () => {
  it("🔴 sin ninguno de los dos permisos no se enseña nada que acabe en 403", async () => {
    render(<EvidenceTab agentId="dev-1" />);
    expect(await screen.findByText(/needs the Evidence permissions/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture evidence" })).toBeNull();
    expect(api.listEvidenceCaptures).not.toHaveBeenCalled();
  });

  it("⭐ con `evidence_capture` pero SIN lectura: se puede pedir, no leer", async () => {
    render(<EvidenceTab agentId="dev-1" canCapture />);
    expect(await screen.findByRole("button", { name: "Capture evidence" })).toBeInTheDocument();
    expect(screen.getByText(/reading the package needs the Evidence download permission/)).toBeInTheDocument();
    expect(api.listEvidenceCaptures).not.toHaveBeenCalled();
  });

  it("con sólo lectura se ve la lista, sin botones de capturar ni borrar", async () => {
    render(<EvidenceTab agentId="dev-1" canRead />);
    await screen.findByText(/no da escritorio/);
    expect(screen.queryByRole("button", { name: "Capture evidence" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});

describe("EvidenceTab — lo que la pantalla dice", () => {
  it("⭐ avisa de que lo volátil se pierde al reiniciar: es el momento de pulsar", async () => {
    render(<EvidenceTab agentId="dev-1" canCapture canRead />);
    expect(await screen.findByText(/capture before restarting it/i)).toBeInTheDocument();
  });

  it("⭐ pinta la hora del EQUIPO y avisa de que no es la de quien mira", async () => {
    // El navegador del test va en UTC; el equipo, en UTC-5.
    render(<EvidenceTab agentId="dev-1" canRead />);
    await screen.findByText(/07:52/);
    expect(screen.getByText("(UTC-5)")).toBeInTheDocument();
    expect(screen.getByText(/device time — not your timezone/)).toBeInTheDocument();
  });

  it("⭐ «Partial» se explica: no es un fallo, es lo recogido más lo que faltó", async () => {
    render(<EvidenceTab agentId="dev-1" canRead />);
    expect(await screen.findByText("Partial")).toBeInTheDocument();
  });

  it("⭐ el paquete dice QUÉ contiene antes de descargarlo, y el motivo de cada ausencia", async () => {
    render(<EvidenceTab agentId="dev-1" canRead />);
    await userEvent.click(await screen.findByRole("button", { name: "Open" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/user names and the addresses/)).toBeInTheDocument();
    expect(within(dialog).getByText(/recorded against your account/)).toBeInTheDocument();
    // El colector que falló se nombra CON su motivo.
    expect(within(dialog).getByText(/access denied/)).toBeInTheDocument();
    // Y sólo se ofrece descargar lo que de verdad llegó.
    expect(within(dialog).getAllByRole("link", { name: "Download" })).toHaveLength(1);
  });

  it("la descarga pasa por el backend, que la apunta en la auditoría", async () => {
    render(<EvidenceTab agentId="dev-1" canRead />);
    await userEvent.click(await screen.findByRole("button", { name: "Open" }));
    const link = within(await screen.findByRole("dialog")).getByRole("link", { name: "Download" });
    expect(link).toHaveAttribute("href", "/api/v1/evidence/cap-1/artifacts/sessions.txt");
  });
});

describe("EvidenceTab — acciones", () => {
  it("pedir una captura manda el motivo y refresca la lista", async () => {
    api.createEvidenceCapture.mockResolvedValue({ capture: { captureId: "cap-2" } });
    render(<EvidenceTab agentId="dev-1" canCapture canRead />);
    await screen.findByRole("button", { name: "Capture evidence" });

    await userEvent.type(screen.getByLabelText(/Why/), "se colgó el RDP");
    await userEvent.click(screen.getByRole("button", { name: "Capture evidence" }));

    await waitFor(() => expect(api.createEvidenceCapture).toHaveBeenCalledWith({ deviceId: "dev-1", reason: "se colgó el RDP" }));
    expect(await screen.findByText(/Capture requested/)).toBeInTheDocument();
  });

  it("🔴 un equipo desconectado se dice con las palabras del backend, no «error»", async () => {
    api.createEvidenceCapture.mockRejectedValue({
      body: { error: "DEVICE_OFFLINE", message: "That device is not connected right now, so its live state cannot be captured." },
    });
    render(<EvidenceTab agentId="dev-1" canCapture canRead />);
    await userEvent.click(await screen.findByRole("button", { name: "Capture evidence" }));
    expect(await screen.findByText(/not connected right now/)).toBeInTheDocument();
  });

  it("🔴 una captura RETENIDA no se puede borrar desde la pantalla", async () => {
    api.listEvidenceCaptures.mockResolvedValue({ captures: [{ ...CAPTURE, heldReason: "INC-1042" }] });
    render(<EvidenceTab agentId="dev-1" canCapture canRead />);
    await screen.findByText("Held");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
