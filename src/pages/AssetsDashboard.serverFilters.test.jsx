// src/pages/AssetsDashboard.serverFilters.test.jsx
//
// Los filtros de la tabla de Assets (?versionBucket=, ?platform=, ?groupId=)
// se aplican EN EL SERVIDOR. En el navegador filtraban la página cargada: en
// T111 la dona decía "Older 4" y la tabla filtrada enseñaba 2.
//
// El servidor de pruebas contesta con filas distintas según los parámetros,
// así que una tabla filtrada en el navegador no puede pasar por casualidad.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

const host = (id, version) => ({
  agent_id: id,
  hostname: id,
  os_platform: "Windows",
  agent_version: version,
});

// Página 1 SIN filtro: todos al día. Los "older" sólo existen si el servidor
// los busca — como en campo, donde estaban en la página 2.
const PAGE_ONE = Array.from({ length: 25 }, (_, i) => host(`current-${i}`, "1.1.70"));
const OLDER = [host("old-a", "1.1.63"), host("old-b", "1.1.65")];

function mount(search, { oldBackend = false } = {}) {
  const hostCalls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/binaries/agent/metadata/all")) {
        return HttpResponse.json({
          ok: true,
          items: [{ platform: "windows", arch: "x64", ok: true, data: { latestVersion: "1.1.70" } }],
        });
      }
      if (url.pathname.endsWith("/orchestrator/devices-connected")) {
        // Nueve conectados, sólo UNO de ellos entre los «older».
        return HttpResponse.json({
          ok: true,
          deviceIds: ["old-a", ...Array.from({ length: 8 }, (_, i) => `current-${i}`)],
        });
      }
      if (url.pathname.endsWith("/dashboard/agent-versions")) {
        return HttpResponse.json({
          ok: true,
          total: 27,
          byVersion: [
            { version: "1.1.70", count: 25 },
            { version: "1.1.65", count: 1 },
            { version: "1.1.63", count: 1 },
          ],
        });
      }
      if (url.pathname.endsWith("/asset-groups")) {
        return HttpResponse.json({ items: [{ id: 7, name: "Windows PCs", type: "dynamic", memberCount: 30 }] });
      }
            if (/\/asset-groups\/7\/members$/.test(url.pathname)) {
        // Página de 25 de un grupo de 30: el chip tiene que decir 30.
        return HttpResponse.json({
          items: Array.from({ length: 25 }, (_, i) => ({ deviceId: `m${i}` })),
          total: 30,
          page: 1,
          pageSize: 25,
        });
      }
      if (url.pathname.endsWith("/dashboard/hosts")) {
        const q = Object.fromEntries(url.searchParams);
        hostCalls.push(q);
        if (oldBackend) return HttpResponse.json({ items: PAGE_ONE, total: 27, page: 1, pageSize: 25 });
        const filtered = "agentVersions" in q;
        return HttpResponse.json({
          items: filtered ? OLDER : PAGE_ONE,
          total: filtered ? 2 : 27,
          page: 1,
          pageSize: 25,
          filters: filtered ? { agentVersions: q.agentVersions.split(",") } : {},
        });
      }
      return HttpResponse.json({
        ok: true, items: [], total: 0, count: 0, groups: [], summary: {}, permissions: ["assets_view"],
      });
    })
  );
  window.history.replaceState({}, "", `/?page=assets${search}`);
  render(
    <ConfirmProvider>
      <AssetsDashboard onAssetsEmptyStateChange={vi.fn()} suppressEmptyStateOverlay onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
  return hostCalls;
}

const shownLine = () => screen.getByText(/shown ·/).textContent;

describe("AssetsDashboard — filtros en servidor", () => {
  it("⭐ versionBucket=older pide al servidor las versiones EXACTAS del grupo y pinta lo que devuelve", async () => {
    const calls = mount("&versionBucket=older");

    await waitFor(() =>
      expect(calls.some((q) => q.agentVersions === "1.1.65,1.1.63")).toBe(true)
    );
    await waitFor(() => expect(shownLine()).toMatch(/^2 shown · 2 total/));
    expect(screen.getByText("old-a")).toBeTruthy();
  });

  it("⭐ el KPI «Agent versions» es de la flota, no de la página filtrada", async () => {
    // Prod, 24-sep: con «Current» pulsado en el donut el KPI pasaba de 5 a 1
    // — contaba las versiones de las filas cargadas en la tabla.
    mount("&versionBucket=older");
    await waitFor(() => expect(shownLine()).toMatch(/^2 shown · 2 total/));
    // Hay dos «Agent versions»: el KPI y el donut. El KPI es la tarjeta corta.
    const kpi = () =>
      screen
        .getAllByText(/^Agent versions$/i)
        .map((el) => el.closest(".MuiPaper-root"))
        .find((p) => p && !/Latest published|enrolled/i.test(p.textContent));
    await waitFor(() => expect(kpi().textContent).toMatch(/Agent versions\s*3$/i));
  });

  it("⭐ «Inactive assets» lleva la vista hasta lo que abre (queda bajo el pliegue)", async () => {
    // Prod, 24-sep: la vista se abría abajo, sin scroll, y el clic parecía
    // muerto. Lo mismo la ficha abierta desde Device experience.
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      mount("");
      await waitFor(() => expect(shownLine()).toMatch(/shown/));
      await userEvent.setup().click(screen.getByText(/^Inactive assets$/i));
      await waitFor(() => expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "start" })));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("⭐ «online» cuenta las filas que se ven, no la flota", async () => {
    // Prod, 24-sep: «3 shown · 3 total · 9 online».
    mount("&versionBucket=older");
    await waitFor(() => expect(shownLine()).toBe("2 shown · 2 total · 1 online"));
  });

  it("con más filas que la página, lo dice", async () => {
    mount("");
    await waitFor(() => expect(shownLine()).toBe("25 shown · 27 total · 8 online on this page"));
  });

  it("platform y groupId viajan al servidor", async () => {
    const calls = mount("&platform=linux&groupId=7");

    await waitFor(() => expect(calls.some((q) => q.platform === "linux" && q.assetGroupId === "7")).toBe(true));
  });

  it("⭐ elegir un grupo en el selector lo deja en la URL (?groupId=), como los demás filtros", async () => {
    mount("");
    const user = userEvent.setup();
    await user.click(await screen.findByText("Filter by group…"));
    await user.click(await screen.findByRole("option", { name: /Windows PCs/ }));
    await waitFor(() => expect(new URL(window.location.href).searchParams.get("groupId")).toBe("7"));
  });

  it("quitar el chip quita el filtro de la petición y de la URL", async () => {
    const calls = mount("&versionBucket=older");

    const chip = await screen.findByText("Version: older");
    await userEvent.click(chip.parentElement.querySelector("svg"));

    await waitFor(() => expect(calls.at(-1)).not.toHaveProperty("agentVersions"));
    expect(new URL(window.location.href).searchParams.get("versionBucket")).toBeNull();
  });

  it("⚠️ con un backend que aún no filtra (sin `filters`), la tabla filtra en el navegador en vez de enseñarlo todo", async () => {
    mount("&versionBucket=older", { oldBackend: true });

    // El backend viejo devuelve la página sin filtrar (25 al día): el respaldo
    // filtra esa página y no enseña ninguna fila "older", en vez de 25.
    await waitFor(() => expect(shownLine()).toMatch(/^0 shown/));
  });

  it("⭐ el chip del grupo dice el TOTAL de miembros, no los de la primera página", async () => {
    // Validado en el portal: grupo de 30, tabla "30 total" y chip "(25)".
    mount("&groupId=7");

    expect(await screen.findByText(/^Group: .*\(30\)$/)).toBeTruthy();
  });
});
