// src/pages/PatchManagement.drawer-install.test.jsx
//
// Instalar parches desde el panel lateral de un equipo.
//
// ⚠️ EL INCIDENTE (MSIG-DOMAIN, 15-sep-2026): «Install selected» mandó dos KBs a
// un controlador de dominio a las 10:03 de un martes, sin preguntar nada: ni
// reinicio, ni aviso de ventana o snapshot. El backend ya retiene esos jobs; aquí
// se prueba que la UI pregunta ANTES, manda la lista explícita y cuenta lo que
// pasó de verdad («retenido hasta la ventana», no «queued»).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve({ role: "ADMIN", permissions: ["patch_management"] }),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 1, tenantMember: { role: "ADMIN", isActive: true, tenantId: 1 } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({ useMspOptional: () => ({ activeTenant: null }) }));

import PatchManagement from "./PatchManagement";
import { clearCachedFetch } from "../hooks/useCachedFetch";

const DEVICES = [
  { agentId: "dc-1", hostname: "MSIG-DOMAIN", platform: "windows", overallStatus: "updates_available", missingCount: 2, criticalCount: 1, rebootRequired: false, collectedAtUtc: "2026-09-15T00:00:00Z" },
];
const ITEMS = [
  { hotfixId: "KB5122882", title: "2026-09 Cumulative Update", severity: "critical" },
  { hotfixId: "KB5126149", title: "2026-09 .NET Cumulative Update", severity: "important" },
];

let posted;
function mount({ jobResponse }) {
  posted = [];
  server.use(
    http.all(/.*\/api\/.*/, async ({ request }) => {
      const url = new URL(request.url);
      if (request.method === "POST" && /\/orchestrator\/devices\/[^/]+\/jobs$/.test(url.pathname)) {
        posted.push(await request.json());
        return jobResponse();
      }
      if (/\/patch-management\/devices\/[^/]+\/items$/.test(url.pathname)) {
        return HttpResponse.json({ ok: true, agentId: "dc-1", items: ITEMS });
      }
      const items = url.pathname.endsWith("/patch-management/devices") ? DEVICES : [];
      return HttpResponse.json({
        ok: true,
        items,
        devices: [],
        findings: [],
        catalog: [{ key: "pmp", required: false }],
        policy: { policy_version: 1, policy_hash: "h", policy_json: { plugins: { enabled: ["amp", "pmp"] } } },
        summary: {},
        total: items.length,
      });
    })
  );
  window.history.replaceState({}, "", "/?page=patch");
  render(<ConfirmProvider><PatchManagement onNavigate={vi.fn()} /></ConfirmProvider>);
}

async function openDrawerAndInstallAll() {
  const cell = await screen.findByText("MSIG-DOMAIN");
  fireEvent.click(cell);
  await screen.findByText("KB5122882");
  fireEvent.click(screen.getByRole("button", { name: /^Install all$/i }));
  return screen.findByRole("dialog");
}

beforeEach(() => clearCachedFetch());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

const HELD = () =>
  HttpResponse.json({
    ok: true,
    jobId: "j1",
    status: "awaiting_window",
    gate: { status: "awaiting_window", opensAt: "2026-09-16T03:00:00.000Z" },
  });

describe("Patch Management — instalar desde el panel lateral", () => {
  it("⭐ pregunta ANTES de mandar nada, y avisa de ventana y snapshot", async () => {
    mount({ jobResponse: HELD });
    const dialog = await openDrawerAndInstallAll();

    expect(posted).toEqual([]);
    expect(within(dialog).getByText(/maintenance windows/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/snapshot is taken first/i)).toBeInTheDocument();
  });

  it("⚠️ «Install all» manda la lista EXPLÍCITA y sin reinicio por defecto", async () => {
    // Antes mandaba `kbArticleIds: []` —«instala TODO»—, que el backend rechaza.
    mount({ jobResponse: HELD });
    const dialog = await openDrawerAndInstallAll();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Install$/ }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      jobType: "patch_install",
      payload: { mode: "install", kbArticleIds: ["KB5122882", "KB5126149"], rebootIfRequired: false },
    });
  });

  it("el reinicio se elige en el diálogo y viaja en el payload", async () => {
    mount({ jobResponse: HELD });
    const dialog = await openDrawerAndInstallAll();
    // Por la etiqueta visible, que es lo que el operador lee: el rol accesible
    // del Switch cambia entre versiones de MUI y no es lo que se prueba aquí.
    fireEvent.click(within(dialog).getByLabelText(/Restart when the patch requires it/i));
    fireEvent.click(within(dialog).getByRole("button", { name: /^Install$/ }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].payload.rebootIfRequired).toBe(true);
  });

  it("🔴 MSIG-DOMAIN fuera de ventana: la UI dice RETENIDO, no «queued»", async () => {
    mount({ jobResponse: HELD });
    const dialog = await openDrawerAndInstallAll();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Install$/ }));

    expect(await screen.findByText(/Held until the maintenance window opens/i)).toBeInTheDocument();
  });

  it("si la puerta lo bloquea, dice por qué", async () => {
    mount({
      jobResponse: () =>
        HttpResponse.json(
          { ok: false, error: "patch_install_blocked", reason: "snapshot_required_but_unavailable" },
          { status: 409 }
        ),
    });
    const dialog = await openDrawerAndInstallAll();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Install$/ }));

    expect(await screen.findByText(/Not dispatched — snapshot required but unavailable/i)).toBeInTheDocument();
  });
});
