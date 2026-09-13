// src/pages/Jobs.serverFilters.test.jsx
//
// "Failed jobs · last 7 days" del Overview enlaza a
// `?page=jobs&status=failed,timeout&since=7d`. En T111 decía 5 y la tabla
// enseñaba 1: filtraba en el navegador sobre las 200 filas más recientes y
// 4 de los fallos estaban detrás de 549 jobs más nuevos.
//
// El servidor de pruebas devuelve listas DISTINTAS con y sin filtro, así que
// una tabla construida con la lista sin filtrar no puede pasar por casualidad.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve({ role: "ADMIN", permissions: ["jobs"] }),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 1, tenantMember: { role: "ADMIN", isActive: true, tenantId: 1 } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import Jobs from "./Jobs";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

const job = (id, status, extra = {}) => ({
  job_id: id,
  device_id: `dev-${id}`,
  job_type: "agent_update",
  status,
  created_at: "2026-09-10T10:00:00Z",
  ...extra,
});

// 3 completados recientes (lo que ve la ventana sin filtrar) y 2 fallos
// viejos que sólo devuelve el servidor cuando se le pide el filtro.
const RECENT = [job("r1", "completed"), job("r2", "completed"), job("r3", "completed")];
const FAILED = [job("f1", "failed"), job("t1", "timeout")];

function mount(search) {
  const jobCalls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (/\/tenants\/[^/]+\/jobs$/.test(url.pathname)) {
        jobCalls.push(Object.fromEntries(url.searchParams));
        const filtered = url.searchParams.has("status") || url.searchParams.has("since");
        return HttpResponse.json({ ok: true, items: filtered ? FAILED : RECENT, truncated: false });
      }
      return HttpResponse.json({ ok: true, items: [], jobs: [], devices: [], types: [], total: 0, buckets: [] });
    })
  );
  window.history.replaceState({}, "", `/?page=jobs${search}`);
  render(<ConfirmProvider><Jobs onNavigate={vi.fn()} /></ConfirmProvider>);
  return jobCalls;
}

const showing = () => screen.getByText(/^Showing/).textContent;

describe("Jobs — filtros del enlace, en servidor", () => {
  it("⭐ status=failed,timeout&since=7d se piden AL SERVIDOR y la tabla enseña lo que devolvió", async () => {
    const calls = mount("&status=failed,timeout&since=7d");

    await waitFor(() =>
      expect(calls).toContainEqual({ limit: "200", status: "failed,timeout", since: "7d" })
    );
    await waitFor(() => expect(showing()).toMatch(/Showing 2 rows/));
    // La ventana sin filtrar se sigue pidiendo: de ella salen los contadores.
    expect(calls).toContainEqual({ limit: "200" });
  });

  it("la ventana se ve y se puede quitar", async () => {
    const calls = mount("&status=failed,timeout&since=7d");

    const chip = await screen.findByText("Created in the last 7 days");
    await userEvent.click(chip.parentElement.querySelector("svg"));

    await waitFor(() => expect(screen.queryByText("Created in the last 7 days")).toBeNull());
    expect(new URL(window.location.href).searchParams.get("since")).toBeNull();
    await waitFor(() => expect(calls).toContainEqual({ limit: "200", status: "failed,timeout" }));
  });

  it("sin filtros no hay segunda petición y la tabla es la de siempre", async () => {
    const calls = mount("");

    await waitFor(() => expect(showing()).toMatch(/Showing 3 rows/));
    expect(calls.every((c) => !("status" in c) && !("since" in c))).toBe(true);
  });
});
