// src/pages/PKI.report.test.jsx
//
// El botón "Report" de PKI lleva al informe del MOTOR (`pki.agent-certificates`)
// y sustituye al CSV de cobertura que se armaba aquí con la página visible:
// 25 equipos que parecían la flota.

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
  // La página pide TODAS las páginas del catálogo: un doble que sólo
  // conozca `listKnownDevices` deja la función real en undefined.
  listAllKnownDevices: vi.fn().mockResolvedValue({ items: [] }),
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

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function abrir(onNavigate) {
  window.history.replaceState({}, "", "/?page=pki");
  render(<ConfirmProvider><PKI onNavigate={onNavigate} /></ConfirmProvider>);
}

describe("PKI — cabecera", () => {
  it("un ADMIN ve Report, que navega a Reports con el informe de certificados; el CSV de la página ya no está", async () => {
    mockGetMyCapabilities.mockResolvedValue({ role: "ADMIN", permissions: ["pki"] });
    const onNavigate = vi.fn();
    abrir(onNavigate);

    const boton = await screen.findByRole("button", { name: /^report$/i });
    expect(screen.queryByRole("button", { name: /^csv$/i })).toBeNull();

    fireEvent.click(boton);
    expect(onNavigate).toHaveBeenCalledWith("reports");
    const params = new URLSearchParams(window.location.search);
    expect(params.get("reportKey")).toBe("pki.agent-certificates");
  });

  it("⚠️ con `pki` pero sin ADMIN/OWNER no se ofrece: el informe pide rol y sería un 403", async () => {
    mockGetMyCapabilities.mockResolvedValue({ role: "IT Support", permissions: ["pki"] });
    abrir(vi.fn());

    await waitFor(() => expect(screen.getByRole("button", { name: /^json$/i })).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
  });
});
