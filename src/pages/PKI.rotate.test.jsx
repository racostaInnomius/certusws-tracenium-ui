// src/pages/PKI.rotate.test.jsx
//
// ADR-0015 — pedir a un equipo que reemita su identidad, desde el portal.
//
// ⚠️ LO QUE ESTE FICHERO DEFIENDE, Y QUE NO ES OBVIO: el backend contesta
// **202 en dos casos que significan cosas opuestas**.
//
//   { ok: true,  status: "dispatched",       jobId }      → salió
//   { ok: false, status: "pending_approval", requestId }  → espera a una persona
//
// `res.ok` es cierto en los dos, así que el cliente HTTP los entrega como
// éxito y quien no mire el cuerpo pinta "renovación lanzada" sobre una
// petición que no ha lanzado nada. Al revés —tratar el segundo como
// error— sería un rojo sobre el gate haciendo exactamente su trabajo.
//
// Los otros dos desenlaces con nombre propio (`BREAK_GLASS_REQUIRES_OWNER`
// y `ROTATION_CAP_REACHED`) sí llegan como excepción, y merecen mensaje
// propio: un "no se pudo renovar" genérico deja al operador sin saber si
// le falta un rol, si tiene que esperar, o si el expediente iba corto.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const { CERT, mockGetMyCapabilities, mockRotate } = vi.hoisted(() => ({
  CERT: {
    fingerprint_sha256: "aa:bb:cc",
    status: "active",
    serial: "01",
    subject_cn: "device-1",
    not_before: "2026-01-01T00:00:00Z",
    not_after: "2027-04-16T00:00:00Z",
  },
  mockGetMyCapabilities: vi.fn(),
  mockRotate: vi.fn(),
}));
vi.mock("../api/roles", () => ({
  getMyCapabilities: (...a) => mockGetMyCapabilities(...a),
}));
vi.mock("../api/certificates", () => ({
  getCertificateSummary: vi.fn().mockResolvedValue({ summary: { total: 1, active: 1 } }),
  listExpiringCertificates: vi.fn().mockResolvedValue({ items: [] }),
  listCertificateDevices: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  listDevicesWithoutActiveCertificates: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  listDeviceCertificates: vi.fn().mockResolvedValue({ certificates: [CERT] }),
  getCertificateDetail: vi.fn().mockResolvedValue({ certificate: CERT }),
  getCertificateActivity: vi.fn().mockResolvedValue({ items: [] }),
  revokeCertificate: vi.fn(),
  requestCertificateRotation: (...a) => mockRotate(...a),
}));
vi.mock("../api/jobs", () => ({
  listKnownDevices: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 7, tenantMember: { isActive: true, role: "ADMIN" } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../hooks/useEffectiveTenantId", () => ({
  useEffectiveTenantId: () => 7,
  default: () => 7,
}));

import PKI from "./PKI";

function abrirInspector() {
  window.history.replaceState(
    {},
    "",
    "/?page=pki&pkiTab=inspector&pkiDeviceId=dev-1&pkiFingerprint=aa:bb:cc"
  );
  render(<ConfirmProvider><PKI /></ConfirmProvider>);
}

/** Rellena el expediente y confirma el diálogo. */
async function pedirRenovacion() {
  fireEvent.change(await screen.findByLabelText("Renewal reason"), {
    target: { value: "corte a la G2" },
  });
  fireEvent.change(screen.getByLabelText("Ticket reference"), {
    target: { value: "ADR-0015-ring-1" },
  });
  fireEvent.click(screen.getByRole("button", { name: /renew certificate/i }));
  // El confirm es un diálogo aparte; su botón repite el texto.
  const botones = await screen.findAllByRole("button", { name: /renew certificate/i });
  fireEvent.click(botones[botones.length - 1]);
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("PKI — renovar la identidad de un equipo", () => {
  it("un rol con la capacidad `pki` pero sin ADMIN/OWNER no ve el formulario", async () => {
    // Mismo criterio que revocar: el backend exige rol en la ruta, así que
    // enseñar el formulario sería ofrecer un 403.
    mockGetMyCapabilities.mockResolvedValue({
      role: "IT Support",
      permissions: ["audit_log", "pki", "enrollment"],
    });

    abrirInspector();

    await waitFor(() => expect(screen.getByText("Renewal")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /renew certificate/i })).toBeNull();
    expect(screen.queryByLabelText("Renewal reason")).toBeNull();
    // ⚠️ El texto tiene que ser el DE RENOVACIÓN: la sección de
    // revocación dice casi lo mismo, y una aserción laxa pasaría aunque
    // este bloque no se pintara.
    expect(screen.getByText(/privileged action on the endpoint/i)).toBeTruthy();
  });

  it("⚠️ un 202 `dispatched` se anuncia como lanzada", async () => {
    mockGetMyCapabilities.mockResolvedValue({ role: "ADMIN", permissions: ["pki"] });
    mockRotate.mockResolvedValue({ ok: true, status: "dispatched", jobId: "job-1" });

    abrirInspector();
    await pedirRenovacion();

    await waitFor(() => expect(mockRotate).toHaveBeenCalledTimes(1));
    expect(mockRotate).toHaveBeenCalledWith("dev-1", {
      reason: "corte a la G2",
      ticketRef: "ADR-0015-ring-1",
    });
    await waitFor(() => expect(screen.getByText(/Renewal dispatched/i)).toBeTruthy());
  });

  it("⚠️ un 202 `pending_approval` NO se pinta como fallo", async () => {
    // El corazón del fichero. Los dos vienen con 202 y `res.ok` cierto;
    // sólo el cuerpo los distingue.
    mockGetMyCapabilities.mockResolvedValue({ role: "ADMIN", permissions: ["pki"] });
    mockRotate.mockResolvedValue({
      ok: false,
      status: "pending_approval",
      requestId: "req-1",
      expiresAt: "2026-09-08T19:26:05.320Z",
    });

    abrirInspector();
    await pedirRenovacion();

    await waitFor(() => expect(screen.getByText(/Waiting for approval/i)).toBeTruthy());
    expect(screen.queryByText(/Failed to request renewal/i)).toBeNull();
  });

  it("⚠️ el break-glass sólo se le ofrece a un OWNER", async () => {
    // Porque el backend sólo se lo acepta a un OWNER: una casilla que
    // produce un 403 es peor que no tener casilla.
    mockGetMyCapabilities.mockResolvedValue({ role: "ADMIN", permissions: ["pki"] });
    abrirInspector();
    await screen.findByLabelText("Renewal reason");
    expect(screen.queryByText(/Break-glass/i)).toBeNull();

    cleanup();
    mockGetMyCapabilities.mockResolvedValue({ role: "OWNER", permissions: ["pki"] });
    abrirInspector();
    await screen.findByLabelText("Renewal reason");
    expect(screen.getByText(/Break-glass/i)).toBeTruthy();
  });

  it("⚠️ cada rechazo con nombre propio dice QUÉ hacer", async () => {
    mockGetMyCapabilities.mockResolvedValue({ role: "ADMIN", permissions: ["pki"] });

    const cap = Object.assign(new Error("HTTP 429"), {
      status: 429,
      code: "ROTATION_CAP_REACHED",
      body: { message: "Ya hay 5 rotaciones en vuelo para este tenant" },
    });
    mockRotate.mockRejectedValue(cap);

    abrirInspector();
    await pedirRenovacion();

    // El mensaje del backend, no uno genérico: dice cuántas hay y que se
    // espere, que es lo accionable.
    await waitFor(() => expect(screen.getByText(/5 rotaciones en vuelo/i)).toBeTruthy());
  });

  it("no manda nada si falta el expediente", async () => {
    // Reason y ticket son obligatorios en el backend; pedirlos aquí evita
    // un viaje que sólo puede volver con un 400.
    mockGetMyCapabilities.mockResolvedValue({ role: "ADMIN", permissions: ["pki"] });
    abrirInspector();

    fireEvent.change(await screen.findByLabelText("Renewal reason"), {
      target: { value: "sin ticket" },
    });
    fireEvent.click(screen.getByRole("button", { name: /renew certificate/i }));

    await waitFor(() => expect(screen.getByText(/both required/i)).toBeTruthy());
    expect(mockRotate).not.toHaveBeenCalled();
  });
});
