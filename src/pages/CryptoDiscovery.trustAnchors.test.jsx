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
    getCdpExposure: vi.fn(async () => ({ exposure: null })),
    getCdpRoadmap: vi.fn(async () => ({ ok: true, systems: [], waves: [], weights: {} })),
    getCdpReadinessHistory: vi.fn(async () => ({ ok: true, snapshots: [] })),
    getCdpFacets: vi.fn(async () => ({ rows: [] })),
    getCdpStores: vi.fn(async () => ({ stores: [] })),
    getCdpTimeline: vi.fn(async () => ({ buckets: [], references: [] })),
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
      () => expect(screen.getByRole("button", { name: /stop trusting/i })).toBeTruthy(),
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
      () => expect(screen.getByText(/184 anchors/)).toBeTruthy(),
      { timeout: 4000 }
    );
  });

  // ── La cuenta de equipos ──────────────────────────────────────────
  //
  // `novelDeviceCount` es un SUBCONJUNTO de `deviceCount`: sale de un
  // FILTER sobre las mismas filas. Comprobado en los 3 tenants el
  // 2026-09-01: cero anclas con nueva > total.
  //
  // Se pintaba "11 (1 nueva)", que se lee igual de bien como "11, de los
  // cuales 1" que como "11 y además 1". Con la segunda lectura el número
  // deja de significar nada, y un operador no puede saber si la CA está
  // en 11 equipos o en 12.

  it("⚠️ el recuento reciente se dice como subconjunto, no como suma", async () => {
    // El caso real que lo destapó: SecureTrust CA en T1.
    listCdpTrustAnchors.mockResolvedValue({
      items: [ancla({ subjectCN: "SecureTrust CA", deviceCount: 11, novelDeviceCount: 1 })],
      counts: { total: 1, distrusted: 0, novel: 1, vendorBundleOnly: 0 }
    });

    await abrirPestaña();

    await waitFor(() => expect(screen.getByText(/SecureTrust CA/)).toBeTruthy(), { timeout: 4000 });

    // El total sigue siendo scaneable por su cuenta.
    expect(screen.getByText("11")).toBeTruthy();
    // Y la parte reciente dice explícitamente que sale de ese total.
    expect(screen.getByText(/1 of them recent/)).toBeTruthy();
    // La forma vieja, ambigua, no puede volver.
    expect(screen.queryByText("11 (1 nueva)")).toBeNull();
  });

  it("la explicación larga dice las dos mitades y sus totales", async () => {
    // 11 = 10 que ya la tenían + 1 que la cogió después. Que los dos
    // sumandos aparezcan es lo que hace imposible la lectura aditiva.
    listCdpTrustAnchors.mockResolvedValue({
      items: [ancla({ deviceCount: 11, novelDeviceCount: 1 })],
      counts: { total: 1, distrusted: 0, novel: 1, vendorBundleOnly: 0 }
    });

    await abrirPestaña();

    await waitFor(
      () => expect(screen.getByText(/Already on 10 devices since they were inventoried/)).toBeTruthy(),
      { timeout: 4000 }
    );
    expect(screen.getByText(/on 1 of the 11 it appeared later/)).toBeTruthy();
  });

  it("sin recientes no inventa una segunda línea", async () => {
    // `distrusted` para que la fila pase el filtro "solo hallazgos", que
    // viene activado: un ancla con 0 recientes y sin motivo NO es un
    // hallazgo y se esconde — comportamiento correcto que hay que
    // rodear para poder mirar la celda.
    listCdpTrustAnchors.mockResolvedValue({
      items: [
        ancla({ deviceCount: 18, novelDeviceCount: 0, distrusted: "retirada del programa de raíces" })
      ],
      counts: { total: 1, distrusted: 1, novel: 0, vendorBundleOnly: 0 }
    });

    await abrirPestaña();

    await waitFor(() => expect(screen.getByText("18")).toBeTruthy(), { timeout: 4000 });
    expect(screen.queryByText(/of them recent/)).toBeNull();
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
