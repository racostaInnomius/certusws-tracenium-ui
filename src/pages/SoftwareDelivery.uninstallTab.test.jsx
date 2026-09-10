// src/pages/SoftwareDelivery.uninstallTab.test.jsx
//
// ⚠️ ESTE FICHERO EXISTE POR UN FALLO QUE NINGÚN TEST DE ENTONCES PODÍA CAZAR.
//
// La desinstalación desde el inventario se entregó como un botón en la barra de
// herramientas de la pestaña «Deployments». Los 12 tests del flujo pasaban, el
// backend respondía y la cadena estaba en el chunk desplegado del portal — y el
// owner dijo «no veo en UI lo nuevo para el uninstall». Tenía razón: había
// pedido explícitamente «separa Uninstall detected software a su propia tab» y
// se dejó para más adelante.
//
// Probar que un componente funciona no prueba que alguien pueda llegar a él.
// Esto fija lo segundo: que la PESTAÑA existe, se puede pulsar, y lleva a la
// vista. Es la segunda vez que pasa lo mismo (la primera fue Location history
// en Asset Management), así que la red va en la barra, no en el componente.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { server, respond } from "../test/msw/server";

const MOCK_AUTH = {
  tenantId: "1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
  email: "op@tracenium.test",
  bootstrap: { tenantId: "1" },
};

vi.mock("../msp/MspContext", () => ({ useMspOptional: () => ({ activeTenant: null }) }));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false }),
}));

import SoftwareDelivery from "./SoftwareDelivery";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount() {
  respond("get", /\/api\/v1\/plugins\/catalog.*/, {
    ok: true,
    catalog: [
      { key: "amp", required: true },
      { key: "sdp", required: false },
    ],
  });
  respond("get", /\/api\/v1\/policies\/tenants\/.*\/policy.*/, {
    ok: true,
    policy: {
      policy_version: 3,
      policy_hash: "abc123",
      policy_json: { plugins: { enabled: ["amp", "sdp"] } },
    },
  });
  respond("get", /\/api\/v1\/software-delivery.*/, { ok: true, items: [] });
  respond("get", /\/api\/v1\/dashboard\/software-inventory.*/, { ok: true, items: [], total: 0 });
  // ⚠️ `canManage` NO sale del rol del token: es `isActive` Y la capacidad
  // `software_delivery` que devuelve este endpoint. Sin mockearlo, el `catch`
  // deja el conjunto vacío y la pestaña enseña el aviso de permiso — que es
  // justo lo que pasó al escribir esto, y también una explicación posible de
  // por qué un operador no ve la función aunque esté desplegada.
  respond("get", /\/api\/v1\/tenants\/.*\/roles\/me\/capabilities.*/, {
    ok: true,
    capabilities: ["software_delivery"],
    permissions: ["software_delivery"],
  });
  return render(<SoftwareDelivery />);
}

describe("la desinstalación es ALCANZABLE, no sólo está montada", () => {
  it("⚠️ hay una pestaña «Uninstall» en la barra", async () => {
    mount();
    // En la barra de pestañas, que es a lo que un usuario llama «tab». Un botón
    // en una barra de herramientas dentro de otra pestaña no lo es.
    const tab = await screen.findByRole("tab", { name: /uninstall/i });
    expect(tab).toBeTruthy();
  });

  it("un clic en la pestaña lleva a la vista, sin pasos intermedios", async () => {
    // Cero diálogos que abrir: la vista ES la pestaña. Cada clic de más es una
    // oportunidad de que la función no se encuentre.
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("tab", { name: /uninstall/i }));

    expect(await screen.findByText(/Uninstall detected software/i)).toBeTruthy();
    // Y el primer paso está a la vista, no detrás de nada.
    await waitFor(() => expect(screen.getByLabelText("Application name")).toBeTruthy());
  });

  it("⚠️ y el botón viejo YA NO está en «Deployments»", async () => {
    // Dos caminos a la misma vista es la trampa contraria: el que se olvida se
    // pudre. Al mover la función, la entrada anterior se elimina.
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("tab", { name: /deployments/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /uninstall detected software/i })).toBeNull()
    );
  });

  it("la pestaña va DESPUÉS de Distribution", async () => {
    // El orden importa para encontrarla: Overview primero y el resto
    // alfabético — Catalog · Deployments · Distribution · Uninstall.
    mount();
    await screen.findByRole("tab", { name: /uninstall/i });
    const labels = screen.getAllByRole("tab").map((t) => t.textContent.trim());
    expect(labels).toEqual(["Overview", "Catalog", "Deployments", "Distribution", "Uninstall"]);
  });
});
