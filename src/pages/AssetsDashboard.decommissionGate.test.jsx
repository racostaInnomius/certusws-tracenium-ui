// src/pages/AssetsDashboard.decommissionGate.test.jsx
//
// El botón Delete (dar de baja) de la tabla de Assets sólo aparece con la
// capacidad `device_management`, que es lo que exige el backend desde que
// POST /api/v1/devices/:id/decommission-jobs pasó a requireCapability. Antes se
// enseñaba a cualquiera con `assets_view` —USER incluido— y acababa en 403.
//
// Mientras las capacidades cargan, tampoco: un botón que aparece y desaparece
// es peor que uno que llega tarde.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";
import { clearCachedFetch } from "../hooks/useCachedFetch";

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: "1", tenantMember: { role: "USER", isActive: true, tenantId: "1" } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import AssetsDashboard from "./AssetsDashboard";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
});

function mount(permissions) {
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/roles/me/capabilities")) {
        return HttpResponse.json({ ok: true, permissions });
      }
      if (url.pathname.endsWith("/dashboard/hosts")) {
        return HttpResponse.json({
          items: [{ agent_id: "dev-1", hostname: "LAPTOP-01", os_platform: "Windows", agent_version: "1.1.70" }],
          total: 1,
          page: 1,
          pageSize: 25,
          filters: {},
        });
      }
      return HttpResponse.json({ ok: true, items: [], total: 0, count: 0, groups: [], summary: {} });
    })
  );
  window.history.replaceState({}, "", "/?page=assets");
  render(
    <ConfirmProvider>
      <AssetsDashboard onAssetsEmptyStateChange={vi.fn()} suppressEmptyStateOverlay onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
}

describe("AssetsDashboard — botón de baja según device_management", () => {
  it("sin device_management (USER): la tabla sale, Delete no", async () => {
    mount(["assets_view", "jobs", "alerts", "reports"]);
    await screen.findByText("LAPTOP-01");
    expect(screen.queryByRole("button", { name: /^Delete$/ })).toBeNull();
    expect(screen.getByRole("button", { name: /More actions for this device/i })).toBeTruthy();
  });

  it("con device_management: Delete aparece", async () => {
    mount(["assets_view", "device_management"]);
    await screen.findByText("LAPTOP-01");
    await waitFor(() => expect(screen.getByRole("button", { name: /^Delete$/ })).toBeTruthy());
  });
});
