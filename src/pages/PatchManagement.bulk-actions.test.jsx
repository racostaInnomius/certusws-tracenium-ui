// src/pages/PatchManagement.bulk-actions.test.jsx
//
// Las acciones de flota de la pestaña Patches (recorrido del 25-sep, T1):
//   · «Force patch scan» salía a TODA la flota con un clic, sin preguntar;
//   · la vista previa de instalar listaba DESKTOP-9G467VM —sin conectar desde el
//     19-sep— como cualquier otro equipo;
//   · «quality / rollup … non-security» se llevaba las actualizaciones de
//     seguridad de los Mac y los Linux (su severidad llega como desconocida).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const caps = vi.hoisted(() => ({ value: { role: "ADMIN", permissions: ["patch_management"] } }));
vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve(caps.value),
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
  { agentId: "a-on", hostname: "SRVOC-MainAgent", platform: "linux", overallStatus: "updates_available", missingCount: 3, collectedAtUtc: "2026-09-25T00:00:00Z" },
  { agentId: "a-off", hostname: "DESKTOP-9G467VM", platform: "windows", overallStatus: "updates_available", missingCount: 2, collectedAtUtc: "2026-09-19T00:00:00Z" },
];

let posts;
function mount() {
  posts = [];
  server.use(
    http.all(/.*\/api\/.*/, async ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/orchestrator/devices-connected")) {
        return HttpResponse.json({ ok: true, deviceIds: ["a-on"], count: 1 });
      }
      if (request.method === "POST" && url.pathname.endsWith("/patch-management/bulk-scan")) {
        posts.push("bulk-scan");
        return HttpResponse.json({ ok: true, dispatched: [] });
      }
      if (request.method === "POST" && url.pathname.endsWith("/patch-management/bulk-install")) {
        const body = await request.json();
        posts.push(body.dryRun ? "bulk-install:dry" : "bulk-install");
        return HttpResponse.json({
          ok: true,
          plan: [
            { agentId: "a-on", hostname: "SRVOC-MainAgent", platform: "linux", kbCount: 3 },
            { agentId: "a-off", hostname: "DESKTOP-9G467VM", platform: "windows", kbCount: 2 },
          ],
        });
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

/** El botón «Remediate» de la fila de una acción, por su nombre. */
async function remediate(actionName) {
  const title = await screen.findByText(actionName);
  let row = title.parentElement;
  while (row && !within(row).queryByRole("button", { name: /Remediate/ })) row = row.parentElement;
  fireEvent.click(within(row).getByRole("button", { name: /Remediate/ }));
}

afterEach(() => {
  caps.value = { role: "ADMIN", permissions: ["patch_management"] };
  cleanup();
  server.resetHandlers();
  clearCachedFetch();
});

describe("Patch Management — acciones de flota", () => {
  it("🔴 «Force patch scan» pregunta, dice a cuántos, y cancelar no manda nada", async () => {
    mount();
    await screen.findByText("SRVOC-MainAgent");
    await remediate("Force patch scan");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/goes to all 2 devices/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toEqual([]);
  });

  it("confirmar sí lanza el escaneo", async () => {
    mount();
    await screen.findByText("SRVOC-MainAgent");
    await remediate("Force patch scan");
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Scan 2 devices" }));
    await waitFor(() => expect(posts).toEqual(["bulk-scan"]));
  });

  it("⚠️ la vista previa marca el equipo desconectado y lo dice", async () => {
    mount();
    await screen.findByText("SRVOC-MainAgent");
    await remediate("Install all other pending updates");

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/Will dispatch to 2 devices/);
    const off = within(dialog).getByText("DESKTOP-9G467VM").closest("div");
    expect(within(off).getByText("offline")).toBeInTheDocument();
    const on = within(dialog).getByText("SRVOC-MainAgent").closest("div");
    expect(within(on).queryByText("offline")).toBeNull();
    expect(within(dialog).getByText(/1 of them is offline right now/)).toBeInTheDocument();
    expect(posts).toEqual(["bulk-install:dry"]);
  });

  it("⚠️ la segunda acción ya no promete «non-security»", async () => {
    mount();
    expect(await screen.findByText("Install all other pending updates")).toBeInTheDocument();
    expect(screen.queryByText(/non-security/)).toBeNull();
    expect(screen.getByText(/which can include security fixes/)).toBeInTheDocument();
  });

  it("🔴 sin patch_management los botones de flota salen desactivados (el backend da 403)", async () => {
    // Auditoría 1-oct-2026: /bulk-install sólo miraba el plan, así que
    // cualquier miembro activo instalaba con reinicio en toda la flota.
    caps.value = { role: "USER", permissions: ["jobs"] };
    mount();
    await screen.findByText("SRVOC-MainAgent");
    expect(await screen.findByTestId("pmp-actions-need-permission")).toBeInTheDocument();

    const title = screen.getByText("Install all other pending updates");
    let row = title.parentElement;
    while (row && !within(row).queryByRole("button", { name: /Remediate/ })) row = row.parentElement;
    expect(within(row).getByRole("button", { name: /Remediate/ })).toBeDisabled();
    expect(posts).toEqual([]);
  });
});
