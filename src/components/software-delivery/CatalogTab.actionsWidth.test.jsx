// src/components/software-delivery/CatalogTab.actionsWidth.test.jsx
//
// 🔴 EL DEFECTO (30-sep). La columna de acciones del catálogo medía 150 px,
// escrito a mano. Cabían cuatro botones. Cuando se añadió «Archive» pasaron a
// cinco, y el último —justo «Delete»— quedó cortado en todas las filas activas.
// Medido en producción a 1440 px: celda de 150 px, 168 px de contenido, 4 de 5
// botones visibles. Nada dio error.
//
// ⚠️ jsdom no maqueta, así que aquí no se puede medir píxeles. Lo que se fija es
// la relación que se rompió: el ancho sale del NÚMERO de botones, y ese número
// se cuenta en lo que de verdad se pinta. Añadir un sexto botón sin subir
// CATALOG_ROW_ACTIONS hace fallar esto, en vez de volver a esconder el último.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { server, respond } from "../../test/msw/server";
import { CATALOG_ROW_ACTIONS, actionsColumnWidth } from "./CatalogTab";

const MOCK_AUTH = {
  tenantId: "1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
  email: "op@tracenium.test",
  bootstrap: { tenantId: "1" },
};

vi.mock("../../msp/MspContext", () => ({ useMspOptional: () => ({ activeTenant: null }) }));
vi.mock("../../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false }),
}));

import SoftwareDelivery from "../../pages/SoftwareDelivery";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

const CHROME = {
  id: 21,
  name: "Google Chrome",
  version: "154.0.8037.58",
  platform: "macos",
  arch: "any",
  format: "dmg",
  isActive: true,
  sha256: "a".repeat(64),
};

function mount() {
  respond("get", /\/api\/v1\/plugins\/catalog.*/, { ok: true, catalog: [{ key: "sdp", required: false }] });
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
  respond("get", /\/api\/v1\/software-delivery.*/, { ok: true, items: [CHROME] });
  window.history.replaceState({}, "", "/?page=software-delivery&sdpTab=catalog");
  return render(<SoftwareDelivery />);
}

describe("actionsColumnWidth", () => {
  it("🔴 cinco botones necesitan más de los 150 px que había", () => {
    // 5 × 30 px + 4 huecos de 2 px + 10 px de celda por lado = 178.
    expect(actionsColumnWidth(5)).toBeGreaterThanOrEqual(178);
    expect(actionsColumnWidth(5)).toBeGreaterThan(150);
  });

  it("crece con cada botón: el ancho sigue al número, no a un literal", () => {
    expect(actionsColumnWidth(6) - actionsColumnWidth(5)).toBe(32);
  });
});

describe("la fila del catálogo", () => {
  it("🔴 no pinta más botones de los que caben en su columna", async () => {
    // El peor caso: con permiso de gestión y el paquete ACTIVO, que es cuando
    // aparece «Install on devices» y la fila tiene todos sus botones.
    mount();
    const del = await screen.findByRole("button", { name: /delete package/i });
    const cell = del.closest('[data-field="actions"]');
    expect(cell).not.toBeNull();

    const botones = within(cell).getAllByRole("button");
    expect(botones.length).toBeLessThanOrEqual(CATALOG_ROW_ACTIONS);
  });

  it("🔴 el ancho QUE SE APLICA a la columna alcanza para los botones que se pintan", async () => {
    // La prueba de verdad. jsdom no maqueta, pero el DataGrid sí deja el ancho
    // de la columna en el estilo de la cabecera (`width: 180px`). Se compara con
    // lo que necesitan los botones que DE VERDAD hay en la fila.
    //
    // ⚠️ Las dos pruebas de arriba no bastaban: si alguien vuelve a escribir
    // `width: 150` a mano en la columna, saltándose el cálculo, las dos seguían
    // en verde. Así nació el fallo original.
    mount();
    const del = await screen.findByRole("button", { name: /delete package/i });
    const botones = within(del.closest('[data-field="actions"]')).getAllByRole("button");

    const header = document.querySelector('[role="columnheader"][data-field="actions"]');
    const aplicado = parseFloat(header?.style.width || "0");

    expect(aplicado).toBeGreaterThanOrEqual(actionsColumnWidth(botones.length));
  });

  it("⚠️ y «Delete» sigue estando en la fila", async () => {
    // El que se quedó fuera. Que exista en el DOM no prueba que se vea —eso lo
    // mide el navegador—, pero sí que el recuento de arriba lo incluye.
    mount();
    expect(await screen.findByRole("button", { name: /delete package/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /archive package/i })).toBeInTheDocument();
  });
});

