// El chip que dice qué filtra la tabla de Hardware Inventory.
//
// ⚠️ Prod, 24-sep: al pulsar un tramo de los histogramas de disco o memoria
// el chip enseñaba la clave interna — «disk_0_49 · 8», «mem_17_32 · 3» —
// porque esas claves no estaban en FLEET_FILTER_LABELS.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

function mount(fleetFilter, { disk = [] } = {}) {
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/hardware-inventory/summary")) {
        return HttpResponse.json({ fleet: { total: 17, distribution: { disk, memory: [] } } });
      }
      if (url.pathname.endsWith("/hardware-inventory/detail")) {
        return HttpResponse.json({
          items: Array.from({ length: 3 }, (_, i) => ({ agentId: `a${i}`, hostname: `PC-${i}` })),
          total: 3,
        });
      }
      return HttpResponse.json({ ok: true, items: [], total: 0, permissions: ["assets_view"] });
    })
  );
  render(<HardwareInventory initialFleetFilter={fleetFilter} />);
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
});
