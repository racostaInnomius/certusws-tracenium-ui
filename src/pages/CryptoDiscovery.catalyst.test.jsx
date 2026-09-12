// src/pages/CryptoDiscovery.catalyst.test.jsx
//
// El número de la portada y la lista de debajo cuentan lo MISMO.
//
// El contador de firmas alternativas post-cuánticas incluye las anclas
// —que la cadena de confianza sea híbrida es media noticia—, y la lista
// del inventario mira por defecto sólo entidades finales. Sin abrir la
// lente al navegar, la tarjeta diría 4 y la lista enseñaría 2: es
// exactamente el fallo que ya se pagó el 2026-09-06 y que dio pie a
// cdp-counts-consistency en el backend.

import { afterEach, beforeEach, describe, expect, it, vi, waitFor } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor as rtlWaitFor } from "@testing-library/react";

const MOCK_AUTH = {
  tenantId: "1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
  email: "op@tracenium.test",
  bootstrap: { tenantId: "1" }
};
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false, refreshAuth: vi.fn() }),
  AuthProvider: ({ children }) => children
}));

const listCdpCertificates = vi.fn(async () => ({ items: [], total: 0 }));

vi.mock("../api/cdp", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getCdpSummary: vi.fn(async () => ({})),
    // El bloque que alimenta la tira: 4 certificados, 2 equipos, 2 anclas.
    // El sobre `{ ok, dashboard }` es el del backend — la página lee
    // `resp.dashboard`, así que un doble sin sobre probaría otra cosa.
    getCdpDashboard: vi.fn(async () => ({
      ok: true,
      dashboard: { pqAltSignature: { certificates: 4, devices: 2, anchors: 2 } }
    })),
    getCdpExposure: vi.fn(async () => ({ exposure: null })),
    getCdpTimeline: vi.fn(async () => ({})),
    getCdpPqcReadiness: vi.fn(async () => ({ ok: true, pqc: null })),
    getCdpFacets: vi.fn(async () => ({ rows: [] })),
    listCdpCertificates: (...a) => listCdpCertificates(...a),
    listCdpDevices: vi.fn(async () => ({ items: [], total: 0 })),
    listCdpDeviceCertificates: vi.fn(async () => ({ items: [] })),
    listCdpTrustAnchors: vi.fn(async () => ({ items: [] })),
    listOrphanKeys: vi.fn(async () => ({ ok: true, items: [], total: 0 })),
    listCdpConnectors: vi.fn(async () => ({ ok: true, secretsConfigured: true, connectors: [] })),
    listCdpAdcsSources: vi.fn(async () => ({ ok: true, sources: [] })),
    listCdpProbeCandidates: vi.fn(async () => ({ ok: true, candidates: [] }))
  };
});
vi.mock("../api/policies", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getTenantPolicy: vi.fn(async () => ({ ok: true, policy: { policy_version: 1, policy_json: { cdp: {} } } })),
    patchTenantPolicyDomain: vi.fn(async () => ({ ok: true, policyVersion: 2 }))
  };
});
vi.mock("../hooks/useEffectiveTenantId", () => ({ useEffectiveTenantId: () => "1" }));

import CryptoDiscovery from "./CryptoDiscovery";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const montar = () =>
  render(
    <ConfirmProvider>
      <CryptoDiscovery />
    </ConfirmProvider>
  );

beforeEach(() => {
  window.history.replaceState({}, "", "/?page=cdp");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("la tira de firma alternativa lleva a su lista", () => {
  it("⭐ el botón abre Inventory con el filtro catalyst Y la lente abierta", async () => {
    montar();

    fireEvent.click(await screen.findByRole("button", { name: /see which ones/i }, { timeout: 4000 }));

    await rtlWaitFor(() => expect(listCdpCertificates).toHaveBeenCalled());
    const enviado = listCdpCertificates.mock.calls.at(-1)[0];
    expect(enviado).toEqual(
      expect.objectContaining({ catalyst: true, certClass: "all", includeRoots: true })
    );
  });

  it("⭐ el filtro queda visible como chip: nunca hay un filtro invisible actuando", async () => {
    window.history.replaceState({}, "", "/?page=cdp&cdpTab=3&catalyst=1");
    montar();

    await rtlWaitFor(() => expect(listCdpCertificates).toHaveBeenCalled(), { timeout: 4000 });
    expect(await screen.findByText(/post-quantum alternative signature/i)).toBeInTheDocument();
  });

  it("sin el filtro, la lista NO lo manda ni abre la lente", async () => {
    window.history.replaceState({}, "", "/?page=cdp&cdpTab=3");
    montar();

    await rtlWaitFor(() => expect(listCdpCertificates).toHaveBeenCalled(), { timeout: 4000 });
    const enviado = listCdpCertificates.mock.calls[0][0];
    expect(enviado.catalyst).toBeUndefined();
    expect(enviado.certClass).toBeUndefined();
    expect(enviado.includeRoots).toBeUndefined();
  });
});
