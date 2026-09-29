// src/pages/AssetsDashboard.softwareTab.test.jsx
//
// Ficha del equipo › Software: 15 filas, orden por columna y búsqueda, los
// tres EN EL SERVIDOR. La tabla trae 15 de N apps: ordenar o buscar sólo en
// la página visible diría algo falso del resto.
//
// Se prueba desde la página entera, no sólo la pestaña: el cableado del padre
// (estado → petición) es donde se pierde un parámetro sin que nada falle.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";
import { clearCachedFetch } from "../hooks/useCachedFetch";

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
  server.resetHandlers();
});

function mount() {
  const appCalls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (/\/software-inventory\/hosts\/pc-1\/apps$/.test(url.pathname)) {
        const q = Object.fromEntries(url.searchParams);
        appCalls.push(q);
        // El servidor responde según lo que se le pide: una tabla ordenada o
        // filtrada en el navegador no pasaría por casualidad.
        const items = q.search ? [{ id: "z", name: "Zoom Workplace", publisher: "Zoom", source: "win32-registry" }]
          : q.sortBy === "name"
            ? [{ id: "a", name: "7-Zip", publisher: "Igor Pavlov", source: "win32-registry" }]
            : [{ id: "c", name: "OpenAI.Codex", publisher: null, source: "ms-store" }];
        return HttpResponse.json({ items, total: q.search ? 1 : 40, page: Number(q.page), pageSize: Number(q.pageSize) });
      }
      return HttpResponse.json({
        ok: true, items: [], total: 0, count: 0, groups: [], summary: {}, permissions: ["assets_view"],
      });
    })
  );
  window.history.replaceState({}, "", `/?page=assets&device=pc-1`);
  render(
    <ConfirmProvider>
      <AssetsDashboard onAssetsEmptyStateChange={vi.fn()} suppressEmptyStateOverlay onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
  return appCalls;
}

async function openSoftwareTab() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name: /^Software/ }));
  await screen.findByRole("table", { name: "agent software table" });
  return user;
}

describe("Ficha › Software — orden, búsqueda y 15 filas en el servidor", () => {
  it("⭐ la primera petición pide 15 filas en el orden de siempre (Detected, más reciente primero)", async () => {
    const calls = mount();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toMatchObject({ page: "1", pageSize: "15", sortBy: "detectedAtUtc", sortDir: "desc" });
    expect(calls[0].search).toBeUndefined();
  });

  it("⭐ pulsar «Application» ordena por nombre en el servidor; pulsarla otra vez invierte", async () => {
    const calls = mount();
    const user = await openSoftwareTab();
    const tabla = screen.getByRole("table", { name: "agent software table" });

    await user.click(within(tabla).getByRole("button", { name: "Application" }));
    await waitFor(() => expect(calls.at(-1)).toMatchObject({ sortBy: "name", sortDir: "asc", page: "1" }));
    expect(await screen.findByText("7-Zip")).toBeInTheDocument();

    await user.click(within(tabla).getByRole("button", { name: "Application" }));
    await waitFor(() => expect(calls.at(-1)).toMatchObject({ sortBy: "name", sortDir: "desc" }));
  });

  it("⭐ la búsqueda viaja al servidor y el chip dice cuántas coinciden", async () => {
    const calls = mount();
    const user = await openSoftwareTab();

    await user.type(screen.getByRole("textbox", { name: "Search installed applications" }), "zoom");
    await waitFor(() => expect(calls.at(-1)).toMatchObject({ search: "zoom", page: "1" }));
    expect(await screen.findByText("Zoom Workplace")).toBeInTheDocument();
    expect(screen.getByText("1 matching")).toBeInTheDocument();
  });
});
