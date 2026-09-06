// src/pages/PKI.revoke.test.jsx
//
// Revocar no es mirar.
//
// Las lecturas de PKI cuelgan de la capacidad `pki` (ADR-0011 Phase 3), y eso
// está bien: un rol de soporte que diagnostica por qué un equipo no enrola
// necesita ver la cobertura. Revocar es otra cosa — corta el gRPC del equipo
// en cuanto se detecta y no se deshace desde el portal, porque un certificado
// revocado tampoco sirve para renovarse: hay que re-enrolar el equipo.
//
// El backend ya lo exige (ADMIN/OWNER además de la capacidad). Esto comprueba
// que el portal no le pone delante un formulario que sólo va a devolver 403.
//
// El rol sale del MISMO `getMyCapabilities` que ya se pedía para los permisos,
// que es el rol EFECTIVO resuelto por el servidor. No se recalcula aquí: en
// una sesión MSP `auth.role` no es el rol sobre el cliente activo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

// `vi.hoisted` porque las factorías de vi.mock se izan por encima de las
// constantes normales del módulo.
const { CERT, mockGetMyCapabilities } = vi.hoisted(() => ({
  CERT: {
    fingerprint_sha256: "aa:bb:cc",
    status: "active",
    serial: "01",
    subject_cn: "device-1",
    not_before: "2026-01-01T00:00:00Z",
    not_after: "2027-04-16T00:00:00Z",
  },
  mockGetMyCapabilities: vi.fn(),
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

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("PKI — revocar exige ADMIN/OWNER", () => {
  it("un rol personalizado con la capacidad `pki` ve la página, no el revoke", async () => {
    // El caso real: "IT Support" existe en producción con
    // ['audit_log','pki','enrollment'] y un miembro activo.
    mockGetMyCapabilities.mockResolvedValue({
      role: "IT Support",
      permissions: ["audit_log", "pki", "enrollment"],
    });

    abrirInspector();

    // Entra: la capacidad sigue dando acceso de LECTURA.
    await waitFor(() => expect(screen.getByText("Revocation")).toBeTruthy());
    // Pero no hay formulario que rellenar ni botón que pulsar.
    expect(screen.queryByRole("button", { name: /revoke certificate/i })).toBeNull();
    expect(screen.queryByLabelText("Reason")).toBeNull();
    // Y se le dice por qué, incluido lo que cuesta deshacerlo.
    expect(screen.getByText(/enrolled again/i)).toBeTruthy();
  });

  it("un ADMIN sí lo tiene", async () => {
    mockGetMyCapabilities.mockResolvedValue({ role: "ADMIN", permissions: ["pki"] });

    abrirInspector();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /revoke certificate/i })).toBeTruthy()
    );
    expect(screen.getByLabelText("Reason")).toBeTruthy();
  });
});
