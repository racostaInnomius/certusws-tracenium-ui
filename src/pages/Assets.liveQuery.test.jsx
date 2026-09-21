// src/pages/Assets.liveQuery.test.jsx
//
// ADR-0029 F3 — la pestaña Live Query de Asset Management: sólo con el
// permiso `live_query`, y un enlace a ella sin permiso no deja una pantalla en
// blanco.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

function mount(permissions, search = "") {
  server.use(
    http.all(/.*\/api\/.*/, () =>
      HttpResponse.json({ ok: true, items: [], devices: [], hosts: [], groups: [], rows: [], queries: [], summary: {}, total: 0, count: 0, permissions })
    )
  );
  window.history.replaceState({}, "", `/?page=assets${search}`);
  render(
    <ConfirmProvider>
      <Assets onAssetsEmptyStateChange={vi.fn()} suppressEmptyStateOverlay onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
}

describe("Assets — Live Query", () => {
  it("⭐ con el permiso live_query aparece la pestaña y un enlace la abre", async () => {
    mount(["assets_view", "live_query"], "&assetsTab=live-query");
    expect(await screen.findByRole("tab", { name: /live query/i, selected: true })).toBeTruthy();
    expect(await screen.findByTestId("live-query-panel")).toBeInTheDocument();
  });

  it("⚠️ sin el permiso no hay pestaña, y el enlace cae en el Dashboard en vez de en blanco", async () => {
    mount(["assets_view"], "&assetsTab=live-query");
    expect(await screen.findByRole("tab", { name: /dashboard/i, selected: true })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /live query/i })).toBeNull();
    expect(screen.queryByTestId("live-query-panel")).toBeNull();
  });
});
