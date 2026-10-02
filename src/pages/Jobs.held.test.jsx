// src/pages/Jobs.held.test.jsx
//
// 🔴 Auditoría PMP 1-oct-2026. Un patch_install retenido por la ventana de
// mantenimiento o por el snapshot previo:
//   · salía en la tabla como el código crudo «awaiting_window», en gris;
//   · no se podía filtrar;
//   · y el botón Cancel estaba desactivado, aunque el backend sí lo cancela.
// Un parcheo lanzado por error para esta noche no tenía freno desde la UI.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";
import { clearApiCache } from "../api/http";

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
vi.mock("../msp/MspContext", () => ({ useMspOptional: () => ({ activeTenant: null }) }));

import Jobs from "./Jobs";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  clearApiCache();
});

const ahora = new Date().toISOString();
// El job real: MsigFinan6 (T111), retenido desde el 30-sep.
const HELD = {
  job_id: "8d9ab682",
  device_id: "dev-finan6",
  job_type: "patch_install",
  status: "awaiting_window",
  attempts: 0,
  max_attempts: 5,
  last_error: "held:maintenance_window_closed",
  created_at: ahora,
  updated_at: ahora,
};

function mount() {
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (/\/tenants\/[^/]+\/jobs$/.test(url.pathname)) {
        return HttpResponse.json({ ok: true, items: [HELD], truncated: false });
      }
      if (/\/jobs\/8d9ab682$/.test(url.pathname)) return HttpResponse.json({ ok: true, job: HELD });
      return HttpResponse.json({ ok: true, items: [], jobs: [], devices: [], types: [], total: 0, buckets: [] });
    })
  );
  window.history.replaceState({}, "", "/?page=jobs");
  render(<ConfirmProvider><Jobs onNavigate={vi.fn()} /></ConfirmProvider>);
}

describe("Jobs — un job retenido se ve y se puede cancelar", () => {
  it("🔴 la fila dice «Held · window», no el código crudo", async () => {
    mount();
    let row = null;
    await waitFor(() => {
      row = document.querySelector('[role="row"][data-id="8d9ab682"]');
      expect(row).toBeTruthy();
    });
    expect(within(row).getByText("Held · window")).toBeInTheDocument();
  });

  it("🔴 el botón Cancel está ACTIVO para un job retenido", async () => {
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: /^Cancel$/ })).toBeEnabled());
  });
});
