// src/pages/Assets.tabOrder.test.jsx
//
// La barra de Asset Management: Dashboard primero y el resto en orden
// alfabético (petición del usuario, 22-sep-2026). Con y sin Live Query, que
// sólo aparece con su permiso y cae en su sitio alfabético.

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

function mount(permissions) {
  server.use(
    http.all(/.*\/api\/.*/, () =>
      HttpResponse.json({ ok: true, items: [], devices: [], hosts: [], groups: [], rows: [], summary: {}, total: 0, count: 0, permissions })
    )
  );
  window.history.replaceState({}, "", "/?page=assets");
  render(
    <ConfirmProvider>
      <Assets onAssetsEmptyStateChange={vi.fn()} suppressEmptyStateOverlay onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
}

const labels = () => screen.getAllByRole("tab").map((t) => t.textContent.trim());

describe("Asset Management — orden de la barra", () => {
  it("⭐ Dashboard primero, el resto alfabético (con Live Query)", async () => {
    mount(["assets_view", "live_query"]);
    await screen.findByRole("tab", { name: /live query/i });
    const [first, ...rest] = labels();
    expect(first).toBe("Dashboard");
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
    expect(rest).toEqual([
      "Asset Groups", "Hardware Inventory", "Live Query", "Location", "Printers", "Software Inventory", "Windows Domain",
    ]);
  });

  it("sin el permiso, Live Query no está y el orden se mantiene", async () => {
    mount(["assets_view"]);
    await waitFor(() => expect(labels().length).toBe(7));
    expect(labels()).toEqual([
      "Dashboard", "Asset Groups", "Hardware Inventory", "Location", "Printers", "Software Inventory", "Windows Domain",
    ]);
  });
});
