// src/pages/Assets.deeplink.test.jsx
//
// La dona de composición del Overview enlaza a
// `?page=assets&assetsTab=hardware&hwFleet=laptop`. Antes llevaba al
// Dashboard de Assets, que no enseña la composición: la cifra pulsada no se
// veía en ningún sitio al llegar.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: "1", tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import Assets from "./Assets";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount(search) {
  const detail = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/hardware-inventory/detail")) detail.push(Object.fromEntries(url.searchParams));
      return HttpResponse.json({
        ok: true, items: [], devices: [], hosts: [], groups: [], rows: [],
        summary: {}, total: 0, count: 0, permissions: ["assets_view"],
      });
    })
  );
  window.history.replaceState({}, "", `/?page=assets${search}`);
  render(
    <ConfirmProvider>
      <Assets onAssetsEmptyStateChange={vi.fn()} suppressEmptyStateOverlay onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
  return detail;
}

describe("Assets — enlace a Hardware Inventory", () => {
  it("⭐ assetsTab=hardware abre esa pestaña y hwFleet filtra la tabla por el segmento", async () => {
    const detail = mount("&assetsTab=hardware&hwFleet=laptop");

    expect(await screen.findByRole("tab", { name: /hardware/i, selected: true })).toBeTruthy();
    await waitFor(() => expect(detail.some((q) => q.fleetFilter === "laptop")).toBe(true));
  });

  it("un segmento desconocido no filtra (tabla completa, no vacía)", async () => {
    const detail = mount("&assetsTab=hardware&hwFleet=bogus");

    await screen.findByRole("tab", { name: /hardware/i, selected: true });
    await waitFor(() => expect(detail.length).toBeGreaterThan(0));
    expect(detail.every((q) => !("fleetFilter" in q))).toBe(true);
  });

  it("sin parámetros abre el Dashboard, como siempre", async () => {
    mount("");
    expect(await screen.findByRole("tab", { name: /dashboard/i, selected: true })).toBeTruthy();
  });
});
