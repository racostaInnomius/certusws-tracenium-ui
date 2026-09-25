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

const hostDetail = [];
const hostsQueries = [];

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount(search) {
  const detail = [];
  hostDetail.length = 0;
  hostsQueries.length = 0;
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/hardware-inventory/detail")) detail.push(Object.fromEntries(url.searchParams));
      if (url.pathname.endsWith("/dashboard/hosts")) hostsQueries.push(Object.fromEntries(url.searchParams));
      const m = url.pathname.match(/\/dashboard\/hosts\/([^/]+)\/detail$/);
      if (m) hostDetail.push(decodeURIComponent(m[1]));
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

describe("Assets — enlaces viejos a Windows GPOs / Coverage (fundidas en Windows Domain)", () => {
  it("⭐ ?assetsTab=gpos abre Windows Domain con Group Policy seleccionado (no Coverage)", async () => {
    mount("&assetsTab=gpos");
    expect(await screen.findByRole("tab", { name: /windows domain/i, selected: true })).toBeTruthy();
    // "Devices reporting" es del KPI de WindowsGpos; el texto de Coverage no está montado.
    expect(await screen.findByText(/devices reporting/i)).toBeTruthy();
    expect(screen.queryByText(/computers active directory knows about/i)).toBeNull();
  });

  it("⭐ ?assetsTab=coverage abre Windows Domain con Coverage seleccionado (no Group Policy)", async () => {
    mount("&assetsTab=coverage");
    expect(await screen.findByRole("tab", { name: /windows domain/i, selected: true })).toBeTruthy();
    expect(await screen.findByText(/computers active directory knows about/i)).toBeTruthy();
    expect(screen.queryByText(/devices reporting/i)).toBeNull();
  });
});

describe("Assets — enlace a UN equipo (?device=)", () => {
  it("⭐ ?device=<id> abre la ficha de ese equipo en el Dashboard", async () => {
    mount("&device=a-2");
    expect(await screen.findByRole("tab", { name: /dashboard/i, selected: true })).toBeTruthy();
    await waitFor(() => expect(hostDetail).toContain("a-2"));
    // El enlace se consume: recargar no vuelve a abrirlo.
    expect(new URLSearchParams(window.location.search).get("device")).toBeNull();
  });
});

describe("Assets — filtro de «Last check-in» (?checkIn=)", () => {
  it("⭐ el enlace filtra la tabla en el servidor y enseña su chip, que lo quita", async () => {
    mount("&checkIn=gt7d");
    await waitFor(() => expect(hostsQueries.some((q) => q.checkIn === "gt7d")).toBe(true));
    const chip = await screen.findByText("Last check-in: > 7 days");
    expect(chip).toBeTruthy();
  });

  it("un tramo desconocido no filtra", async () => {
    mount("&checkIn=bogus");
    // Sin filtro, la tabla puede salir de la caché de la página (misma clave que
    // otros tests): lo que se afirma es que NADA pidió un checkIn ni lo rotuló.
    expect(await screen.findByRole("tab", { name: /dashboard/i, selected: true })).toBeTruthy();
    expect(screen.queryByText(/Last check-in:/)).toBeNull();
    expect(hostsQueries.every((q) => !("checkIn" in q))).toBe(true);
  });
});

describe("Assets — filtro de «OS versions» (?osKeys=)", () => {
  it("⭐ el enlace filtra la tabla en el servidor y enseña su chip", async () => {
    mount("&osKeys=g:aaaaaaaaaaaa");
    await waitFor(() => expect(hostsQueries.some((q) => q.osKeys === "g:aaaaaaaaaaaa")).toBe(true));
    expect(await screen.findByText(/^OS: /)).toBeTruthy();
  });
});


describe("Assets — de Hardware Inventory a la ficha del equipo", () => {
  it("⭐ pulsar una fila abre el Dashboard con la ficha de ESE equipo", async () => {
    // Prod, 24-sep: las filas de Hardware Inventory no hacían nada, y no había
    // forma de ir del inventario a la ficha.
    hostDetail.length = 0;
    server.use(
      http.all(/.*\/api\/.*/, ({ request }) => {
        const url = new URL(request.url);
        const m = url.pathname.match(/\/dashboard\/hosts\/([^/]+)\/detail$/);
        if (m) hostDetail.push(decodeURIComponent(m[1]));
        if (url.pathname.endsWith("/hardware-inventory/detail")) {
          return HttpResponse.json({ items: [{ agentId: "dev-9", hostname: "PC-NUEVE" }], total: 1 });
        }
        return HttpResponse.json({
          ok: true, items: [], devices: [], hosts: [], groups: [], rows: [],
          summary: {}, total: 0, count: 0, permissions: ["assets_view"],
        });
      })
    );
    window.history.replaceState({}, "", "/?page=assets&assetsTab=hardware");
    render(
      <ConfirmProvider>
        <Assets onAssetsEmptyStateChange={vi.fn()} suppressEmptyStateOverlay onNavigate={vi.fn()} />
      </ConfirmProvider>
    );

    const celda = await screen.findByText("PC-NUEVE");
    celda.closest(".MuiDataGrid-cell").click();

    await waitFor(() => expect(hostDetail).toContain("dev-9"));
    expect(screen.getByRole("tab", { name: /Dashboard/i })).toHaveAttribute("aria-selected", "true");
  });
});
