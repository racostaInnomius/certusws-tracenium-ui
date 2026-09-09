// src/pages/Alerts.hostname.test.jsx
//
// La columna "Device" del feed enseña el NOMBRE del equipo.
//
// Enseñaba el UUID del agente, que nadie recuerda: para saber de qué máquina
// hablaba una alerta había que copiar el id e irse a buscarlo a otra pantalla.
//
// El id no desaparece —es la clave con la que se navega, y lo único estable si
// a un equipo lo renombran—, pero baja a donde no estorba: el tooltip de la
// celda y su propia fila en la ficha.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, respond } from "../test/msw/server";
import { clearCachedFetch } from "../hooks/useCachedFetch";

const MOCK_AUTH = {
  tenantId: "1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
  email: "op@tracenium.test",
  bootstrap: { tenantId: "1" }
};
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false, refreshAuth: vi.fn() }),
  AuthProvider: ({ children }) => children
}));

import Alerts from "./Alerts";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const UUID = "a3f10c4e-9b21-4d77-8e55-0f2b6c1d9a30";

function evento(over = {}) {
  return {
    source: "disk_capacity",
    sourceEventId: "id-1",
    occurredAt: "2026-09-09T08:00:00.000Z",
    firstSeenAt: "2026-09-09T07:00:00.000Z",
    severity: "high",
    deviceId: UUID,
    hostname: "MSIG-WSUS",
    summary: "Disk at 95%",
    rule: { id: "r1", templateId: null, name: "Disk capacity" },
    details: {},
    ...over
  };
}

function montar(items) {
  respond("get", "/api/v1/alerts/rules", {
    rules: [{ id: "r1", name: "Disk capacity", source: "disk_capacity", enabled: true, severity: "high", criteria: {} }],
    templates: []
  });
  respond("get", "/api/v1/alerts/events", { items, total: items.length, lastSeenAt: new Date(0).toISOString() });
  respond("get", "/api/v1/alerts/unread-count", { count: 0, lastSeenAt: new Date(0).toISOString() });
  respond("post", "/api/v1/alerts/mark-all-seen", { ok: true, lastSeenAt: new Date(0).toISOString() });
  return render(<ConfirmProvider><Alerts /></ConfirmProvider>);
}

const filaDe = (texto) => screen.getByText(texto).closest("tr");

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
});

describe("Alerts — la columna Device", () => {
  it("⭐ enseña el hostname, no el UUID", async () => {
    montar([evento()]);

    expect(await screen.findByText("MSIG-WSUS", {}, { timeout: 4000 })).toBeInTheDocument();
    // ⚠️ Se afirma la AUSENCIA del id en la tabla: si vuelve a pintarse ahí,
    // vuelve el problema que esto viene a quitar.
    expect(screen.queryByText(UUID)).toBeNull();
  });

  it("el id sigue a mano, en el tooltip de la celda", async () => {
    // No se tira: es la clave con la que se navega y lo único estable si a un
    // equipo lo renombran.
    montar([evento()]);

    const celda = await screen.findByText("MSIG-WSUS", {}, { timeout: 4000 });
    expect(celda.getAttribute("title")).toBe(UUID);
  });

  it("sin hostname conocido cae al id, no a una celda en blanco", async () => {
    // El inventario puede no conocer todavía a ese agente. Un UUID es peor de
    // leer que un nombre, pero infinitamente mejor que nada: se puede copiar.
    montar([evento({ hostname: null })]);

    expect(await screen.findByText(UUID, {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it("una alerta sin equipo sigue diciendo «—»", async () => {
    // Las hay de tenant, no de máquina.
    montar([evento({ deviceId: null, hostname: null, summary: "Tenant-level alert" })]);

    const fila = await waitFor(() => filaDe("Tenant-level alert"), { timeout: 4000 });
    expect(within(fila).getByText("—")).toBeInTheDocument();
  });

  it("se busca por nombre Y por id", async () => {
    // Por nombre porque es lo que se recuerda; por id porque quien lo pega de
    // un log o de una URL tiene que seguir encontrando su alerta.
    montar([evento(), evento({ sourceEventId: "id-2", deviceId: "otro-id", hostname: "SRVOC-MAIN", summary: "Disk at 80%" })]);
    await screen.findByText("MSIG-WSUS", {}, { timeout: 4000 });

    const buscar = screen.getByPlaceholderText(/search/i);
    await userEvent.type(buscar, "MSIG");
    await waitFor(() => expect(screen.queryByText("SRVOC-MAIN")).toBeNull());
    // ⚠️ Y que la buscada SIGA ahí. Sin esta mitad el test pasaba con el
    // hostname fuera de la búsqueda: al escribir "MSIG" desaparecían las DOS
    // filas, y afirmar sólo la ausencia de la otra no distinguía "filtró bien"
    // de "no encontró nada".
    expect(screen.getByText("MSIG-WSUS")).toBeInTheDocument();

    await userEvent.clear(buscar);
    await userEvent.type(buscar, UUID.slice(0, 8));
    await waitFor(() => expect(screen.getByText("MSIG-WSUS")).toBeInTheDocument());
    expect(screen.queryByText("SRVOC-MAIN")).toBeNull();
  });
});
