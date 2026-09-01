// src/pages/CryptoDiscovery.trustAnchors.test.jsx
//
// La pestaña "Trust anchors" RENDERIZA.
//
// ⚠️ EL FALLO QUE ESTO CAZA NO ES DE LÓGICA, ES DE IMPORT.
//
// El commit que añadió el botón "No confiar" usó <Button>, <Dialog>,
// <DialogTitle>, <DialogContent> y <DialogActions> sin importarlos. En
// JSX eso son variables libres: no es un error de compilación, es un
// ReferenceError EN TIEMPO DE RENDER. `npm run build` pasaba, `npm test`
// pasaba —ninguna prueba montaba esta pestaña—, y la pestaña salía en
// blanco en producción. ESLint sí lo veía, pero el CI corre solo
// lint:guardrails porque el repo arrastraba otros errores.
//
// Por eso este test MONTA la pestaña de verdad en vez de comprobar el
// SQL o el estado: es la única forma de que un identificador que no
// existe se note antes que el usuario. Cualquier componente nuevo que se
// use aquí sin importar vuelve a poner esto en rojo.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

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

const listCdpTrustAnchors = vi.fn();
vi.mock("../api/cdp", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getCdpSummary: vi.fn(async () => ({})),
    getCdpDashboard: vi.fn(async () => ({})),
    getCdpPqcReadiness: vi.fn(async () => ({})),
    listCdpCertificates: vi.fn(async () => ({ items: [], total: 0 })),
    listCdpDevices: vi.fn(async () => ({ items: [], total: 0 })),
    listCdpTrustAnchors: (...a) => listCdpTrustAnchors(...a),
    distrustAnchor: vi.fn()
  };
});

import CryptoDiscovery from "./CryptoDiscovery";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const ancla = (over = {}) => ({
  fingerprint256: "a".repeat(64),
  subjectCN: "ACME Internal Root CA",
  issuerCN: "ACME Internal Root CA",
  deviceCount: 10,
  novelDeviceCount: 2,
  actionable: true,
  distrusted: null,
  signatureAlgorithm: "sha256WithRSAEncryption",
  storeNames: ["Root"],
  hosts: ["SRV-01"],
  agentIds: ["agent-1"],
  ...over
});

async function abrirPestaña() {
  render(
    <ConfirmProvider>
      <CryptoDiscovery />
    </ConfirmProvider>
  );
  const tab = await screen.findByRole("tab", { name: /trust anchors/i }, { timeout: 4000 });
  tab.click();
  return tab;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("pestaña Trust anchors", () => {
  it("⚠️ monta sin reventar y enseña las anclas", async () => {
    // El test que habría cazado los cinco imports que faltaban. Si
    // cualquier componente usado en la pestaña deja de estar importado,
    // el render lanza y esto se pone rojo.
    listCdpTrustAnchors.mockResolvedValue({
      items: [ancla()],
      counts: { total: 1, distrusted: 0, novel: 1, vendorBundleOnly: 0 }
    });

    await abrirPestaña();

    await waitFor(
      () => expect(screen.getByText(/ACME Internal Root CA/)).toBeTruthy(),
      { timeout: 4000 }
    );
  });

  it("el botón de desconfiar existe en un ancla accionable", async () => {
    // `<Button>` era uno de los identificadores ausentes, y vive dentro
    // de una celda que sólo se pinta cuando el ancla es accionable —
    // justo el tipo de rama que un smoke test superficial no toca.
    listCdpTrustAnchors.mockResolvedValue({
      items: [ancla()],
      counts: { total: 1, distrusted: 0, novel: 1, vendorBundleOnly: 0 }
    });

    await abrirPestaña();

    await waitFor(
      () => expect(screen.getByRole("button", { name: /no confiar/i })).toBeTruthy(),
      { timeout: 4000 }
    );
  });

  it("sin hallazgos sigue pintando el resumen, no una pantalla vacía", async () => {
    // El filtro "solo hallazgos" viene activado, y medido en producción
    // deja T113 en cero. Una tabla vacía es correcta ahí; lo que no
    // puede faltar es la línea que dice cuántas anclas hay en total, o
    // el usuario no distingue "no hay hallazgos" de "esto está roto".
    listCdpTrustAnchors.mockResolvedValue({
      items: [ancla({ novelDeviceCount: 0 })],
      counts: { total: 184, distrusted: 0, novel: 0, vendorBundleOnly: 147 }
    });

    await abrirPestaña();

    await waitFor(
      () => expect(screen.getByText(/184 anclas/)).toBeTruthy(),
      { timeout: 4000 }
    );
  });

  it("un fallo de carga se dice, no se calla", async () => {
    listCdpTrustAnchors.mockRejectedValue(new Error("backend caído"));

    await abrirPestaña();

    await waitFor(
      () => expect(screen.getByText(/backend caído/)).toBeTruthy(),
      { timeout: 4000 }
    );
  });
});
