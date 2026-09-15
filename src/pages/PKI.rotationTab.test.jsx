// src/pages/PKI.rotationTab.test.jsx
//
// La pestaña «Identity rotation» de la página de PKI (ADR-0015).
//
// Tres cosas que tienen que ser verdad:
//   · ALCANZABLE: quien puede rotar la ve a un clic, no enterrada.
//   · Quien no puede rotar NO la ve: el endpoint pide ADMIN/OWNER, así que
//     enseñarla sería ofrecer un 403.
//   · «Open» lleva al inspector del equipo, donde está el formulario de rotación.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const { mockGetMyCapabilities, mockRotationStatus, mockListDeviceCertificates } = vi.hoisted(() => ({
  mockGetMyCapabilities: vi.fn(),
  mockRotationStatus: vi.fn(),
  mockListDeviceCertificates: vi.fn()
}));

vi.mock("../api/roles", () => ({ getMyCapabilities: (...a) => mockGetMyCapabilities(...a) }));
vi.mock("../api/certificates", () => ({
  getCertificateSummary: vi.fn().mockResolvedValue({ summary: { total: 1, active: 1 } }),
  listExpiringCertificates: vi.fn().mockResolvedValue({ items: [] }),
  listCertificateDevices: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  listDevicesWithoutActiveCertificates: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  listDeviceCertificates: (...a) => mockListDeviceCertificates(...a),
  getCertificateDetail: vi.fn().mockResolvedValue({ certificate: null }),
  getCertificateActivity: vi.fn().mockResolvedValue({ items: [] }),
  revokeCertificate: vi.fn(),
  requestCertificateRotation: vi.fn(),
  getCertificateRotationStatus: (...a) => mockRotationStatus(...a)
}));
vi.mock("../api/jobs", () => ({
  listAllKnownDevices: vi.fn().mockResolvedValue({ items: [] }),
  listKnownDevices: vi.fn().mockResolvedValue({ items: [] })
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 7, tenantMember: { isActive: true, role: "ADMIN" } },
    loading: false,
    refreshAuth: vi.fn()
  }),
  AuthProvider: ({ children }) => children
}));
vi.mock("../hooks/useEffectiveTenantId", () => ({ useEffectiveTenantId: () => 7, default: () => 7 }));

import PKI from "./PKI";

const ESTADO = {
  rules: { minAgent: "1.1.70", minAgentWindows: "1.1.74", offlineHours: 24, pendingAlarmMinutes: 15 },
  summary: { total: 1, byState: { hybrid: 0, g2_classic: 0, legacy_issuer: 1, no_active_cert: 0 }, byReadiness: { ready: 1 } },
  devices: [
    {
      deviceId: "dev-mac",
      hostname: "MacBook-Air-de-Diego",
      platform: "macos",
      deviceClass: "endpoint",
      agentVersion: "1.1.73",
      lastSeenAt: "2026-09-15T11:00:00Z",
      state: "legacy_issuer",
      issuer: "Tracenium Issuing CA",
      notAfter: null,
      pendingIssuedAt: null,
      lastRotation: null,
      readiness: "ready"
    }
  ]
};

const abrir = (url = "/?page=pki") => {
  window.history.replaceState({}, "", url);
  render(
    <ConfirmProvider>
      <PKI />
    </ConfirmProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRotationStatus.mockResolvedValue(ESTADO);
  mockListDeviceCertificates.mockResolvedValue({ certificates: [] });
});
afterEach(cleanup);

describe("PKI — pestaña Identity rotation", () => {
  it("⭐ un ADMIN la ve y a un clic enseña el estado de la rotación", async () => {
    mockGetMyCapabilities.mockResolvedValue({ role: "ADMIN", permissions: ["pki"] });
    abrir();

    fireEvent.click(await screen.findByRole("tab", { name: /identity rotation/i }));

    expect(await screen.findByText("MacBook-Air-de-Diego")).toBeInTheDocument();
    expect(mockRotationStatus).toHaveBeenCalled();
  });

  it("⚠️ un rol con `pki` pero sin ADMIN/OWNER no la ve — el endpoint le daría 403", async () => {
    mockGetMyCapabilities.mockResolvedValue({ role: "IT Support", permissions: ["pki"] });
    abrir();

    await screen.findByRole("tab", { name: /fleet overview/i });
    expect(screen.queryByRole("tab", { name: /identity rotation/i })).not.toBeInTheDocument();
    expect(mockRotationStatus).not.toHaveBeenCalled();
  });

  it("⚠️ con la URL pidiendo la pestaña y sin rol, cae a la vista general en vez de a una pestaña vacía", async () => {
    mockGetMyCapabilities.mockResolvedValue({ role: "IT Support", permissions: ["pki"] });
    abrir("/?page=pki&pkiTab=rotation");

    const general = await screen.findByRole("tab", { name: /fleet overview/i });
    await waitFor(() => expect(general).toHaveAttribute("aria-selected", "true"));
    expect(mockRotationStatus).not.toHaveBeenCalled();
  });

  it("⭐ «Open» lleva al inspector de ese equipo, donde vive el formulario de rotación", async () => {
    mockGetMyCapabilities.mockResolvedValue({ role: "ADMIN", permissions: ["pki"] });
    abrir("/?page=pki&pkiTab=rotation");

    fireEvent.click(await screen.findByRole("button", { name: "Open MacBook-Air-de-Diego" }));

    await waitFor(() => expect(mockListDeviceCertificates).toHaveBeenCalledWith("dev-mac"));
    expect(await screen.findByRole("tab", { name: /certificate inspector/i })).toHaveAttribute("aria-selected", "true");
  });
});
