// src/pages/SoftwareDelivery.installTab.test.jsx
//
// «Install» sale del catálogo a su propia pestaña (24-sep).
//
// ⚠️ LO QUE ESTO FIJA NO ES QUE EL COMPONENTE FUNCIONE, sino que se pueda
// LLEGAR a él y que no queden dos caminos vivos haciendo lo mismo. Ya pasó con
// «Uninstall detected software», que se entregó como un botón escondido en otra
// pestaña: los tests del flujo pasaban y el operador no lo encontraba.
//
// Aquí hay dos promesas que se contradicen si se implementan mal:
//   · el catálogo NO despliega (es la biblioteca), y
//   · desde el catálogo se puede empezar a instalar sin volver a buscar nada.
// Se cumplen las dos porque el atajo LLEVA a la pestaña Install con el paquete
// ya elegido: una pantalla de acción, dos puertas.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

const CHROME = {
  id: 14,
  name: "Google Chrome",
  version: "154.0.8037.58",
  platform: "windows",
  arch: "x64",
  format: "msi",
  isActive: true,
  sha256: "a".repeat(64),
};

const RETIRED = { ...CHROME, id: 5, version: "152.0.7977.83", isActive: false };

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount(packages = [CHROME, RETIRED]) {
  respond("get", /\/api\/v1\/plugins\/catalog.*/, {
    ok: true,
    catalog: [{ key: "sdp", required: false }],
  });
  respond("get", /\/api\/v1\/policies\/tenants\/.*\/policy.*/, {
    ok: true,
    policy: { policy_version: 3, policy_hash: "abc", policy_json: { plugins: { enabled: ["sdp"] } } },
  });
  respond("get", /\/api\/v1\/tenants\/.*\/roles\/me\/capabilities.*/, {
    ok: true,
    capabilities: ["software_delivery"],
    permissions: ["software_delivery"],
  });
  respond("get", /\/api\/v1\/dashboard\/software-inventory.*/, { ok: true, items: [], total: 0 });
  respond("get", /\/api\/v1\/asset-groups.*/, { ok: true, items: [] });
  respond("get", /\/api\/v1\/software-delivery.*/, { ok: true, items: packages });
  return render(<SoftwareDelivery />);
}

describe("la pestaña Install", () => {
  it("⭐ existe, se pulsa y enseña lo desplegable", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("tab", { name: /^install$/i }));

    expect(await screen.findByText("Install software")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Install Google Chrome 154\.0\.8037\.58/i })).toBeInTheDocument();
  });

  it("⚠️ un paquete RETIRADO no se ofrece: el servidor lo rechazaría", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("tab", { name: /^install$/i }));
    await screen.findByRole("button", { name: /Install Google Chrome 154/i });

    expect(screen.queryByRole("button", { name: /Install Google Chrome 152/i })).toBeNull();
  });

  it("⭐ elegir un paquete abre el asistente DE SIEMPRE, no otro", async () => {
    // Un camino paralelo que se saltara los anillos, la ventana de
    // mantenimiento y la revisión sería un despliegue de segunda clase.
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("tab", { name: /^install$/i }));
    await user.click(await screen.findByRole("button", { name: /Install Google Chrome 154/i }));

    expect(await screen.findByText(/Deploy Google Chrome v154\.0\.8037\.58/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /asset group/i })).toBeInTheDocument();
  });

  it("🔴 el catálogo YA NO despliega, pero su fila lleva a Install con el paquete puesto", async () => {
    // Las dos mitades del acuerdo. Si sólo se cumpliera la primera, el
    // operador que mira «Chrome 154 publicado» tendría que ir a otra pestaña y
    // volver a buscarlo.
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("tab", { name: /^catalog$/i }));
    const atajo = await screen.findByRole("button", { name: /install on devices/i });
    // Ya no existe el botón que desplegaba desde aquí.
    expect(screen.queryByRole("button", { name: /deploy to fleet/i })).toBeNull();

    await user.click(atajo);

    // El asistente abierto ES la prueba de que llegó a Install con el paquete
    // puesto: sólo esa pestaña lo abre, y sólo con un paquete elegido.
    expect(await screen.findByText(/Deploy Google Chrome v154\.0\.8037\.58/i)).toBeInTheDocument();
  });
});
