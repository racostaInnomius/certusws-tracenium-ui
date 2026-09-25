// Una fila de «Top installed apps» o «Top publishers» filtra la tabla.
//
// ⚠️ Prod, 24-sep: esas filas no hacían nada. Ahora pasan a la vista por
// aplicación con `app` o `rankedPublisher` — la misma clave que el ranking,
// resuelta en el backend (ver software-ranking-filters.itest.ts) — y un chip
// dice qué se está filtrando.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
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

import SoftwareInventory from "./SoftwareInventory";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
});

function mount() {
  const detailCalls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/software-inventory/rankings")) {
        return HttpResponse.json({
          topInstalledApps: [
            { label: "Google Chrome", value: 14 },
            { label: "Microsoft Edge", value: 11 },
          ],
          topInstalledAppsTotal: 25,
          topPublishers: [
            { label: "Microsoft", value: 197 },
            { label: "Apple", value: 134 },
          ],
          topPublishersTotal: 331,
          topPublishersDistinct: 2,
        });
      }
      if (url.pathname.endsWith("/software-inventory/detail")) {
        detailCalls.push(Object.fromEntries(url.searchParams));
        return HttpResponse.json({
          items: [{ id: "r1", agentId: "a1", hostname: "PC-1", name: "Google Chrome", publisher: "Google LLC" }],
          total: 14,
        });
      }
      return HttpResponse.json({ ok: true, items: [], total: 0, permissions: ["assets_view"] });
    })
  );
  render(<SoftwareInventory />);
  return detailCalls;
}

describe("SoftwareInventory — filas del ranking", () => {
  it("⭐ una app del ranking abre la vista por aplicación filtrada por ESA app", async () => {
    const calls = mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Google Chrome/i }));
    await waitFor(() => expect(calls.some((q) => q.app === "Google Chrome")).toBe(true));
    expect(await screen.findByText("App: Google Chrome · 14")).toBeInTheDocument();
    expect(screen.getByText("Software Inventory Detail")).toBeInTheDocument();
  });

  it("⭐ un editor del ranking filtra por su etiqueta normalizada (rankedPublisher), no por la columna cruda", async () => {
    const calls = mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Microsoft(?! Edge)/i }));
    await waitFor(() => expect(calls.some((q) => q.rankedPublisher === "Microsoft")).toBe(true));
    expect(calls.every((q) => q.publisher === undefined)).toBe(true);
    expect(await screen.findByText("Publisher: Microsoft · 14")).toBeInTheDocument();
  });

  it("el chip quita el filtro", async () => {
    const calls = mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Google Chrome/i }));
    const chip = await screen.findByText("App: Google Chrome · 14");
    await user.click(chip.parentElement.querySelector(".MuiChip-deleteIcon"));
    await waitFor(() => expect(screen.queryByText(/App: Google Chrome/)).not.toBeInTheDocument());
    await waitFor(() => expect(calls[calls.length - 1].app).toBeUndefined());
  });
});
