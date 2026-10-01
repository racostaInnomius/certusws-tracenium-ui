// src/pages/AssetsDashboard.loadFailure.test.jsx
//
// 1-oct: si fallaba /dashboard/hosts, la tabla decía «No hosts found · 0 total»
// y ese vacío se guardaba en caché como dato bueno; «Active hosts» enseñaba el
// tamaño de la página y un tick fallido de devices-connected ponía «Online
// now: 0». Una tabla que no cargó no es una flota vacía.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  useMspOptional: () => ({ activeTenant: null }),
}));

import AssetsDashboard from "./AssetsDashboard";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  clearApiCache();
  server.resetHandlers();
});

function mount() {
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      // 400: un error permanente, para que el http no reintente ni sirva caché.
      if (url.pathname.endsWith("/dashboard/hosts")) return HttpResponse.json({ error: "BROKEN" }, { status: 400 });
      if (url.pathname.endsWith("/dashboard/summary")) return HttpResponse.json({ error: "BROKEN" }, { status: 400 });
      if (url.pathname.endsWith("/devices-connected")) return HttpResponse.json({ error: "BROKEN" }, { status: 400 });
      return HttpResponse.json({ ok: true, items: [], total: 0, count: 0, groups: [], summary: {}, permissions: ["assets_view"] });
    })
  );
  window.history.replaceState({}, "", "/?page=assets");
  render(
    <ConfirmProvider>
      <AssetsDashboard onAssetsEmptyStateChange={vi.fn()} suppressEmptyStateOverlay onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
}

describe("⭐ la tabla de equipos no cargó", () => {
  it("lo dice, con Retry, en vez de «No hosts found»; los KPIs son «—», no 0 ni el tamaño de la página", async () => {
    mount();
    expect(await screen.findByText(/The device list could not be loaded\. This is not an empty fleet\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    // Active hosts, Online now e Inactive assets: sin dato.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
