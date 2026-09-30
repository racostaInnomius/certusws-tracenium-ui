// src/pages/AssetsDashboard.deviceHeader.test.jsx
//
// La ficha abierta por `?device=<id>` (Hardware Inventory, Patch Management,
// Overview, alertas): lo que dice la cabecera mientras carga, cuando el
// detalle falla y cuando el equipo no existe en este cliente.
//
// ⚠️ EL CASO (prod, 30-sep): con `/hosts/<id>/detail` caído, la ficha era el
// UUID de título, el UUID en «Hostname», un aviso genérico sin «Retry», y el
// «Refresh» de la página no volvía a pedirla. El inventario de hardware SÍ
// había llegado, con el nombre.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";
import { clearCachedFetch } from "../hooks/useCachedFetch";
import { clearApiCache } from "../api/http";

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: "1", tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: { id: "113", name: "Gtec" } }),
}));

import AssetsDashboard from "./AssetsDashboard";

const ID = "08eaddae-9611-4cc5-abe3-9ac35b76a5bb";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  clearApiCache();
  server.resetHandlers();
});

/** `detail` decide la respuesta de /hosts/<id>/detail en cada llamada. */
function mount(detail) {
  const detailCalls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith(`/dashboard/hosts/${ID}/detail`)) {
        detailCalls.push(Date.now());
        return detail(detailCalls.length);
      }
      if (url.pathname.endsWith("/dashboard/hardware-inventory/detail")) {
        return HttpResponse.json({ items: [{ agentId: ID, hostname: "MarisolCorona", platform: "windows" }], total: 1 });
      }
      return HttpResponse.json({
        ok: true, items: [], total: 0, count: 0, groups: [], summary: {}, permissions: ["assets_view"],
      });
    })
  );
  window.history.replaceState({}, "", `/?page=assets&device=${ID}`);
  render(
    <ConfirmProvider>
      <AssetsDashboard onAssetsEmptyStateChange={vi.fn()} suppressEmptyStateOverlay onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
  return detailCalls;
}

const ok = () => HttpResponse.json({ agent: { agentId: ID, hostname: "MarisolCorona", platform: "windows", agentVersion: "1.1.87" } });
const down = () => HttpResponse.json({ error: "INTERNAL" }, { status: 500 });

describe("Ficha abierta por ?device= — la cabecera", () => {
  it("mientras carga dice «Loading device…», no el UUID", async () => {
    mount(() => new Promise(() => {}));
    expect(await screen.findByTitle("Loading device…")).toBeInTheDocument();
  });

  it("⭐ prod 30-sep: detalle caído → el nombre sale del inventario de hardware; el aviso dice qué falta; Retry lo recupera", async () => {
    let healthy = false;
    const calls = mount(() => (healthy ? ok() : down()));

    // Un fallo pasajero se reintenta una vez antes de rendirse.
    await waitFor(() => expect(calls.length).toBe(2), { timeout: 4000 });
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alert).toHaveTextContent("Could not load device details. Showing what did load.");

    // Título Y campo «Hostname»: el nombre, no el UUID.
    expect(screen.getAllByTitle("MarisolCorona").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTitle("Unknown device")).not.toBeInTheDocument();

    healthy = true;
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(calls.length).toBe(3);
  }, 10_000);

  it("404: el equipo no está en este cliente — ni ficha fantasma ni aviso de «parcial»", async () => {
    const calls = mount(() => HttpResponse.json({ error: "Host detail not found" }, { status: 404 }));
    expect(await screen.findByText("This device isn't in Gtec.")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Agent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Back to devices")).toBeInTheDocument();
    expect(calls.length).toBe(1); // un 404 no se reintenta
  });
});
