// src/pages/RemoteControl.header.test.jsx
//
// La cabecera de Remote Control: el botón "Report" y que el refresco alcance
// a las CUATRO pestañas.
//
// Esta página era la mejor cableada de todas —su `refreshAll` combina
// `invalidateCachePrefix("remoteControl:")`, que limpia lo de las pestañas NO
// montadas, con un nonce que llega a la que sí lo está— y aun así se le
// escapaba Access: ni la matriz de política de acceso ni el registro de
// accesos miraban el nonce, así que se quedaban con la foto del montaje.
// Quien acabara de cambiar una política de aprobación seguía viendo la
// anterior, y el botón de refrescar no la corregía.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

let capabilities = { role: "ADMIN", permissions: ["remote_control"] };
vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve(capabilities),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 1, tenantMember: { role: "ADMIN", isActive: true } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import RemoteControl from "./RemoteControl";

beforeEach(() => {
  capabilities = { role: "ADMIN", permissions: ["remote_control"] };
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount(onNavigate = vi.fn()) {
  const calls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (request.method === "GET") calls.push(url.pathname);
      return HttpResponse.json({ ok: true, items: [], sessions: [], total: 0, approvers: null });
    })
  );
  window.history.replaceState({}, "", "/?page=remote-control");
  render(<ConfirmProvider><RemoteControl onNavigate={onNavigate} /></ConfirmProvider>);
  return calls;
}

describe("Remote Control — cabecera", () => {
  it('el botón "Report" lleva a Reports con el informe preseleccionado', async () => {
    const onNavigate = vi.fn();
    mount(onNavigate);

    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));

    expect(onNavigate).toHaveBeenCalledWith("reports");
    expect(new URL(window.location.href).searchParams.get("reportKey")).toBe("global.fleet-health");
  });

  it("los tres botones de la fila van a la misma altura", async () => {
    // "Start a session" iba `size="small"` junto a un Refresh de tamaño por
    // defecto. En una fila alineada al centro, esa diferencia se lee como un
    // descuido.
    mount();

    const start = await screen.findByRole("button", { name: /start a session/i });
    const report = screen.getByRole("button", { name: /^report$/i });
    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    for (const b of [start, report, refresh]) {
      expect(b.className).not.toMatch(/sizeSmall/);
    }
  });

  it("a quien no es ADMIN/OWNER no se le ofrece el informe", async () => {
    capabilities = { role: "Remote Operator", permissions: ["remote_control"] };

    mount();

    expect(await screen.findByRole("button", { name: /^refresh$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
  });
});

describe("Remote Control — el refresco alcanza también a Access", () => {
  it("la pestaña Access vuelve a pedir su política y su registro", async () => {
    // ⭐ El hueco: `AccessTab` era la única de las cuatro que no recibía el
    // nonce. Se comprueba contando peticiones y no props, que es lo único que
    // demuestra que la pantalla se rehace.
    const calls = mount();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("tab", { name: /access/i }));
    await waitFor(() =>
      expect(calls.some((p) => /access/i.test(p))).toBe(true)
    );
    const antes = calls.filter((p) => /access/i.test(p)).length;

    await user.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(
      () => expect(calls.filter((p) => /access/i.test(p)).length).toBeGreaterThan(antes),
      { timeout: 3000 }
    );
  });
});
