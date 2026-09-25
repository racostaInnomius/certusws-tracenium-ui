// El chip que dice qué filtra la tabla de Hardware Inventory.
//
// ⚠️ Prod, 24-sep: al pulsar un tramo de los histogramas de disco o memoria
// el chip enseñaba la clave interna — «disk_0_49 · 8», «mem_17_32 · 3» —
// porque esas claves no estaban en FLEET_FILTER_LABELS.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

import HardwareInventory from "./HardwareInventory";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
});

function mount(fleetFilter, { disk = [], detailCalls = [], onOpenDevice } = {}) {
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/hardware-inventory/rankings")) {
        return HttpResponse.json({
          // Siete marcas: «View all» sólo aparece con más de cinco.
          topManufacturers: [
            { label: "Apple Inc.", value: 8 },
            { label: "Dell Inc.", value: 2 },
            { label: "Acer", value: 1 },
            { label: "HP", value: 1 },
            { label: "QEMU", value: 1 },
            { label: "Hetzner", value: 1 },
            { label: "OpenStack Foundation", value: 1 },
          ],
          topManufacturersTotal: 7,
        });
      }
      if (url.pathname.endsWith("/hardware-inventory/summary")) {
        return HttpResponse.json({ fleet: { total: 17, distribution: { disk, memory: [] } } });
      }
      if (url.pathname.endsWith("/hardware-inventory/detail")) {
        detailCalls.push(Object.fromEntries(url.searchParams));
        return HttpResponse.json({
          items: Array.from({ length: 3 }, (_, i) => ({ agentId: `a${i}`, hostname: `PC-${i}` })),
          total: 3,
        });
      }
      return HttpResponse.json({ ok: true, items: [], total: 0, permissions: ["assets_view"] });
    })
  );
  render(<HardwareInventory initialFleetFilter={fleetFilter} onOpenDevice={onOpenDevice} />);
}

describe("HardwareInventory — chip del filtro", () => {
  it("⭐ un tramo de disco se nombra, no se enseña su clave", async () => {
    mount("disk_0_49");
    expect(await screen.findByText("Disk 0–49% used · 3")).toBeInTheDocument();
    expect(screen.queryByText(/disk_0_49/)).not.toBeInTheDocument();
  });

  it("⭐ un tramo de memoria, igual", async () => {
    mount("mem_17_32");
    expect(await screen.findByText("Memory 17–32 GB · 3")).toBeInTheDocument();
  });

  it("un tramo que la UI no conoce toma la etiqueta que manda el resumen", async () => {
    mount("disk_99_100", { disk: [{ key: "disk_99_100", label: "99–100%", count: 1 }] });
    expect(await screen.findByText("Disk 99–100% used · 3")).toBeInTheDocument();
  });

  it("⭐ una porción de «Top manufacturers» filtra la tabla por esa marca (y se quita igual)", async () => {
    const detailCalls = [];
    mount("", { detailCalls });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Apple Inc\.: 8 — filter the table/i }));
    await waitFor(() => expect(detailCalls.some((q) => q.manufacturer === "Apple Inc.")).toBe(true));
    expect(await screen.findByText("Manufacturer: Apple Inc. · 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Apple Inc\.: 8 — filter the table/i }));
    await waitFor(() => expect(screen.queryByText(/Manufacturer: Apple/)).not.toBeInTheDocument());
  });

  it("⭐ y una fila de su «View all», igual", async () => {
    const detailCalls = [];
    mount("", { detailCalls });
    const user = userEvent.setup();
    const card = (await screen.findByText("Top manufacturers")).closest(".MuiPaper-root");
    await user.click(within(card).getByRole("button", { name: /View all/i }));
    const dialog = await screen.findByRole("dialog");
    const celda = await waitFor(() => {
      const el = [...dialog.querySelectorAll(".MuiDataGrid-row")].find((r) => r.textContent.includes("Dell Inc."));
      if (!el) throw new Error("fila de Dell no pintada");
      return el;
    });
    await user.click(celda.querySelector(".MuiDataGrid-cell"));
    await waitFor(() => expect(detailCalls.some((q) => q.manufacturer === "Dell Inc.")).toBe(true));
    expect(await screen.findByText("Manufacturer: Dell Inc. · 3")).toBeInTheDocument();
  });

  it("⭐ una fila abre la ficha de ESE equipo (antes no hacía nada)", async () => {
    const onOpenDevice = vi.fn();
    mount("", { onOpenDevice });
    const user = userEvent.setup();
    const fila = await waitFor(() => {
      const el = [...document.querySelectorAll(".MuiDataGrid-row")].find((r) => r.textContent.includes("PC-1"));
      if (!el) throw new Error("fila no pintada");
      return el;
    });
    await user.click(fila.querySelector(".MuiDataGrid-cell"));
    expect(onOpenDevice).toHaveBeenCalledWith("a1");
  });
});
