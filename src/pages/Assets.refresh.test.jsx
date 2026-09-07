// src/pages/Assets.refresh.test.jsx
//
// El botón de refrescar de Asset Management, en TODAS sus pestañas.
//
// El nonce sólo lo miraban AssetsDashboard y Windows GPOs. Con Asset Groups,
// Software o Hardware delante, pulsar Refresh no hacía absolutamente nada — y
// no se notaba, porque el botón se comporta igual tanto si recarga como si no.
// Un refresco que depende de la pestaña abierta es peor que ninguno: enseña
// datos viejos con el gesto de haberlos actualizado.
//
// Se cuentan PETICIONES, no props. Es la única forma de ver la otra mitad del
// problema: `httpGetJson` sirve de una caché de 60 s, así que un tab bien
// cableado tampoco salía a la red si el control no la tiraba antes.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const MOCK_AUTH = {
  tenantId: "1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
  email: "op@tracenium.test",
};
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false, refreshAuth: vi.fn() }),
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

function mount() {
  const calls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      if (request.method === "GET") calls.push(new URL(request.url).pathname);
      return HttpResponse.json({
        ok: true, items: [], devices: [], hosts: [], groups: [], rows: [],
        summary: {}, total: 0, count: 0,
      });
    })
  );
  window.history.replaceState({}, "", "/?page=assets");
  render(
    <ConfirmProvider>
      <Assets onAssetsEmptyStateChange={vi.fn()} suppressEmptyStateOverlay onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
  return calls;
}

// Las cinco pestañas por su rótulo, en el orden en que se pintan.
const PESTANAS = [
  /dashboard/i,
  /asset groups/i,
  /software/i,
  /hardware/i,
  /gpo/i,
];

describe("Asset Management — refrescar funciona en todas las pestañas", () => {
  it.each(PESTANAS.map((p, i) => [String(p), i]))(
    "pestaña %s vuelve a pedir al pulsar Refresh",
    async (_nombre, indice) => {
      const calls = mount();
      const user = userEvent.setup();

      const tab = await screen.findByRole("tab", { name: PESTANAS[indice] });
      await user.click(tab);
      // Dejar que la pestaña haga su carga inicial antes de medir.
      await waitFor(() => expect(calls.length).toBeGreaterThan(0));
      const antes = calls.length;

      // Asset Groups trae su propio "Refresh" dentro de la pestaña, así que
      // hay dos en la página. El de la CABECERA es el primero en el DOM y es
      // el que se está probando: el que tiene que alcanzar a todas.
      await user.click(screen.getAllByRole("button", { name: /^refresh$/i })[0]);

      await waitFor(() => expect(calls.length).toBeGreaterThan(antes), { timeout: 3000 });
    }
  );
});
