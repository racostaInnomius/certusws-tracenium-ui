// src/pages/DeviceManagement.refreshGuard.test.jsx
//
// El refresco de MDM / MAM no puede borrar lo que alguien está editando.
//
// `load` reescribe el formulario MAM y los bloques macOS/iOS con lo que trae
// el servidor, y el auto-refresco viene ACTIVO por defecto. Antes de la guarda,
// un operador que dejaba la pestaña abierta con cambios a medio hacer los
// perdía al siguiente tick sin ningún aviso. Mismo contrato que Agent Settings
// (invariante 5): el tick automático se salta, el botón pregunta.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve({ role: "ADMIN", permissions: ["device_management"] }),
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

import DeviceManagement from "./DeviceManagement";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
});

function mount(search = "?page=device-management") {
  const calls = [];
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      if (request.method === "GET") calls.push(new URL(request.url).pathname);
      return HttpResponse.json({
        ok: true,
        items: [],
        groups: [],
        settings: [],
        // Sin versión mínima guardada: lo que se teclee es una edición.
        policy: { policy_version: 1, policy_hash: "h", policy_json: {} },
      });
    })
  );
  window.history.replaceState({}, "", `/${search}`);
  render(<ConfirmProvider><DeviceManagement onNavigate={vi.fn()} /></ConfirmProvider>);
  return calls;
}

async function editMinimumVersion(user) {
  const field = await screen.findByLabelText(/minimum app version/i);
  await waitFor(() => expect(field).not.toBeDisabled());
  await user.type(field, "2.0.0");
  expect(field).toHaveValue("2.0.0");
  return field;
}

describe("MDM / MAM — el refresco respeta la edición en curso", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setInterval", "clearInterval"] });
  });

  it("❗ el tick del auto-refresco no pisa un cambio sin guardar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount("?page=device-management&deviceManagementAutoRefresh=60");
    const field = await editMinimumVersion(user);

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    // Sin la guarda, `load` devolvía el formulario al valor del servidor ("").
    await new Promise((r) => setTimeout(r, 50));
    expect(field).toHaveValue("2.0.0");
    expect(screen.getByText(/unsaved changes/i)).toBeTruthy();
  });

  it("❗ Refresh con cambios pregunta; cancelar no recarga ni borra nada", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = mount();
    const field = await editMinimumVersion(user);
    const antes = calls.length;

    await user.click(screen.getByRole("button", { name: /^refresh$/i }));
    expect(await screen.findByText(/discard unsaved changes\?/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    await new Promise((r) => setTimeout(r, 50));
    expect(calls.length).toBe(antes);
    expect(field).toHaveValue("2.0.0");
  });

  it("confirmar el descarte sí recarga desde el servidor", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = mount();
    const field = await editMinimumVersion(user);
    const antes = calls.length;

    await user.click(screen.getByRole("button", { name: /^refresh$/i }));
    await user.click(await screen.findByRole("button", { name: /discard and reload/i }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(antes), { timeout: 3000 });
    await waitFor(() => expect(field).toHaveValue(""));
  });

  it("sin cambios, Refresh recarga sin preguntar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = mount();
    await screen.findByLabelText(/minimum app version/i);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const antes = calls.length;

    await user.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(antes), { timeout: 3000 });
    expect(screen.queryByText(/discard unsaved changes\?/i)).toBeNull();
  });
});
