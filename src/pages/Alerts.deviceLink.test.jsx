// src/pages/Alerts.deviceLink.test.jsx
//
// De la ficha de una alerta a la ficha del equipo, en un clic.
//
// La alerta decía de qué máquina hablaba pero no llevaba a ella: había que
// copiar el nombre, ir a Asset Management y buscarlo. Ahora el nombre es un
// enlace y hay un botón explícito, los dos a `?page=assets&device=<agentId>`
// — el parámetro con el que AssetsDashboard abre la ficha.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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

async function abrirFicha(summary) {
  const celda = await screen.findByText(summary, {}, { timeout: 4000 });
  await userEvent.click(celda.closest("tr"));
  return screen.findByRole("presentation");
}

const params = (href) => new URL(href, "http://localhost").searchParams;

beforeEach(() => {
  window.history.replaceState({}, "", "/?page=alerts&alertsTab=feed");
});
afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
});

describe("Alerts — de la alerta al equipo", () => {
  it("⭐ la ficha ofrece abrir el equipo en Asset Management, con su agentId", async () => {
    montar([evento()]);
    const ficha = await abrirFicha("Disk at 95%");

    const boton = within(ficha).getByRole("link", { name: /open device in asset management/i });
    const q = params(boton.getAttribute("href"));
    expect(q.get("page")).toBe("assets");
    expect(q.get("device")).toBe(UUID);
    // La URL de destino parte LIMPIA: la pestaña de Alerts no viaja a Assets.
    expect(q.get("alertsTab")).toBeNull();
  });

  it("el nombre del equipo en la ficha es también el enlace", async () => {
    montar([evento()]);
    const ficha = await abrirFicha("Disk at 95%");

    const nombre = within(ficha).getByRole("link", { name: "MSIG-WSUS" });
    expect(params(nombre.getAttribute("href")).get("device")).toBe(UUID);
  });

  it("sin hostname conocido, el enlace va en el id", async () => {
    montar([evento({ hostname: null })]);
    const ficha = await abrirFicha("Disk at 95%");

    const id = within(ficha).getByRole("link", { name: UUID });
    expect(params(id.getAttribute("href")).get("device")).toBe(UUID);
  });

  it("el clic navega dentro del portal y apila: Atrás vuelve a la alerta", async () => {
    montar([evento()]);
    const ficha = await abrirFicha("Disk at 95%");
    const popstate = vi.fn();
    window.addEventListener("popstate", popstate);
    const antes = window.history.length;

    await userEvent.click(within(ficha).getByRole("link", { name: /open device in asset management/i }));

    window.removeEventListener("popstate", popstate);
    const q = new URLSearchParams(window.location.search);
    expect(q.get("page")).toBe("assets");
    expect(q.get("device")).toBe(UUID);
    // AppShell cambia de página al oír el popstate; sin él, la URL cambia y la
    // pantalla no.
    expect(popstate).toHaveBeenCalled();
    expect(window.history.length).toBe(antes + 1);
  });

  it("una alerta de tenant, sin equipo, no ofrece un enlace que no lleva a nada", async () => {
    montar([evento({ deviceId: null, hostname: null, summary: "Tenant-level alert" })]);
    const ficha = await abrirFicha("Tenant-level alert");

    expect(within(ficha).queryByRole("link", { name: /asset management/i })).toBeNull();
  });
});
