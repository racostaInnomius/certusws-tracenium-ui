// src/pages/SoftwareDelivery.tabUrl.test.jsx
//
// Que la pestaña esté en la URL no es cosmético: es lo que hace que Atrás
// vuelva a la pestaña anterior en vez de sacarte de Software Delivery.
//
// ⚠️ APILAR OBLIGA A ESCUCHAR. Con `pushState` pero sin `popstate`, Atrás
// cambiaría la URL y dejaría la pestaña donde estaba — las dos discrepando,
// que es peor que no tocar la URL. Por eso el caso de Atrás está aquí y no
// sólo el de «se escribe el parámetro».

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
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

beforeEach(() => {
  window.history.replaceState({}, "", "/?page=software-delivery");
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount() {
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
  respond("get", /\/api\/v1\/software-delivery.*/, { ok: true, items: [] });
  return render(<SoftwareDelivery />);
}

const sdpTab = () => new URLSearchParams(window.location.search).get("sdpTab");

describe("la pestaña vive en la URL", () => {
  it("⭐ cambiar de pestaña lo escribe en la barra de direcciones", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("tab", { name: /^install$/i }));
    expect(sdpTab()).toBe("install");
  });

  it("⭐ abrir la URL con ?sdpTab= aterriza en ESA pestaña", async () => {
    // Sin esto no hay enlace que mandar: cinco de las seis pestañas eran
    // inalcanzables salvo pulsando.
    window.history.replaceState({}, "", "/?page=software-delivery&sdpTab=uninstall");
    mount();

    expect(await screen.findByText(/Uninstall detected software/i)).toBeInTheDocument();
  });

  it("🔴 Atrás vuelve a la pestaña anterior, no saca de la página", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("tab", { name: /^install$/i }));
    expect(sdpTab()).toBe("install");

    // ⚠️ `history.back()` en jsdom es ASÍNCRONO: encola el cambio y dispara
    // `popstate` después. Comprobar justo detrás de la llamada lee todavía la
    // URL vieja y da un falso rojo.
    const popped = new Promise((resolve) =>
      window.addEventListener("popstate", resolve, { once: true })
    );
    window.history.back();
    await act(async () => {
      await popped;
    });

    expect(sdpTab()).toBe("overview");
    expect(await screen.findByText(/Catalog coverage/i)).toBeInTheDocument();
  });

  it("⚠️ abrir la página NO deja una entrada de historial de más", async () => {
    // La primera escritura REEMPLAZA: si apilara, el primer Atrás del operador
    // se gastaría en volver a la misma pantalla.
    //
    // ⚠️ Se espía `pushState`, NO `history.length`: en jsdom esa longitud no se
    // mueve de forma fiable, y la aserción pasaba con el bug puesto — una
    // prueba verde que no comprobaba nada.
    const push = vi.spyOn(window.history, "pushState");
    try {
      mount();
      await screen.findByRole("tab", { name: /^install$/i });

      expect(sdpTab()).toBe("overview");
      expect(push).not.toHaveBeenCalled();
    } finally {
      push.mockRestore();
    }
  });

  it("⚠️ …pero el SEGUNDO cambio sí apila: es lo que hace que Atrás vuelva", async () => {
    // El par del caso anterior. Sin este, «no apiles al abrir» se cumpliría
    // trivialmente no apilando nunca, que es el bug original.
    const user = userEvent.setup();
    mount();
    await screen.findByRole("tab", { name: /^install$/i });

    const push = vi.spyOn(window.history, "pushState");
    try {
      await user.click(screen.getByRole("tab", { name: /^install$/i }));
      expect(push).toHaveBeenCalled();
    } finally {
      push.mockRestore();
    }
  });
});
