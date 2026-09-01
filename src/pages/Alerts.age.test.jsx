// src/pages/Alerts.age.test.jsx
//
// La columna "Open for": desde cuándo lleva abierta cada alerta.
//
// POR QUÉ A NIVEL DE PÁGINA Y NO SOLO DEL HELPER. `formatOpenFor` ya
// tiene su propia suite, y probarlo otra vez aquí no diría nada nuevo. Lo
// que esto ejercita es el CABLE: que el campo se llama `firstSeenAt` en
// el envelope que manda el backend, que llega hasta la celda, y que la
// ausencia —el estado normal durante la primera hora tras desplegar, y
// para siempre en las fuentes que el barrido aún no ha visto— se pinta
// como ausencia y no como cero.
//
// El envelope de abajo es el de fetchAlertsFeed en alerts.service.ts.
// Renombrar el campo allí rompe aquí, que es el sitio donde se nota.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

const HORA = 3600_000;
const DIA = 24 * HORA;
const hace = (ms) => new Date(Date.now() - ms).toISOString();

function evento(over = {}) {
  return {
    source: "cdp_cert_expiry",
    sourceEventId: "id-1",
    occurredAt: hace(2 * HORA),
    severity: "medium",
    deviceId: "dev-1",
    summary: "Certificate expiring",
    rule: { id: "r1", templateId: null, name: "Endpoint certificate expiring" },
    details: {},
    ...over
  };
}

function montar(items) {
  respond("get", "/api/v1/alerts/rules", {
    rules: [{ id: "r1", name: "Endpoint certificate expiring", source: "cdp_cert_expiry", enabled: true, severity: "medium", criteria: {} }],
    templates: []
  });
  respond("get", "/api/v1/alerts/events", {
    items,
    total: items.length,
    lastSeenAt: new Date(0).toISOString()
  });
  respond("get", "/api/v1/alerts/unread-count", { count: 0, lastSeenAt: new Date(0).toISOString() });

  return render(
    <ConfirmProvider>
      <Alerts />
    </ConfirmProvider>
  );
}

/** La fila cuyo resumen coincide, para no depender del orden. */
async function fila(resumen) {
  const celda = await screen.findByTitle(resumen, {}, { timeout: 4000 });
  return celda.closest("tr");
}

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
});

describe("la columna Open for", () => {
  it("existe y se explica", async () => {
    montar([evento()]);
    const cab = await screen.findByText("Open for", {}, { timeout: 4000 });
    expect(cab).toBeTruthy();
    expect(cab.getAttribute("title")).toMatch(/first seen by the hourly sweep/i);
  });

  it("pinta la edad que manda el backend", async () => {
    montar([evento({ firstSeenAt: hace(3 * DIA), summary: "tres dias" })]);
    const tr = await fila("tres dias");
    expect(within(tr).getByText("3d")).toBeTruthy();
  });

  it("⚠️ sin firstSeenAt pinta ausencia, no cero", async () => {
    // El estado real de todo el feed durante la primera hora tras
    // desplegar. Un "0m" ahí diría "acaba de abrirse", que es una
    // afirmación que nadie ha hecho.
    montar([evento({ summary: "sin edad" })]);
    const tr = await fila("sin edad");
    expect(within(tr).getByText("—")).toBeTruthy();
    expect(within(tr).queryByText("0m")).toBeNull();
    expect(within(tr).getByTitle(/hasn't seen this alert/i)).toBeTruthy();
  });

  it("una alerta vieja se distingue de una reciente", async () => {
    // El dato por el que existe la columna: "lleva tres semanas y nadie
    // la ha mirado" tiene que verse sin leer el número.
    montar([
      evento({ sourceEventId: "vieja", firstSeenAt: hace(21 * DIA), summary: "abandonada" }),
      evento({ sourceEventId: "nueva", firstSeenAt: hace(2 * HORA), summary: "reciente" })
    ]);

    const vieja = within(await fila("abandonada")).getByText("21d");
    const nueva = within(await fila("reciente")).getByText("2h");

    expect(vieja.getAttribute("title")).toMatch(/Open for 21 days/);
    // Y no comparten estilo: si el umbral dejara de aplicarse, los dos
    // pesos serían iguales y este test lo dice.
    expect(getComputedStyle(vieja).fontWeight).not.toBe(getComputedStyle(nueva).fontWeight);
  });

  it("la edad NO es la hora del evento", async () => {
    // La confusión que la columna existe para deshacer: `occurredAt`
    // viene de la condición —la caducidad del certificado— y puede ser
    // de hace un rato mientras la alerta lleva semanas abierta.
    montar([
      evento({ occurredAt: hace(1 * HORA), firstSeenAt: hace(30 * DIA), summary: "vieja pero reciente" })
    ]);
    const tr = await fila("vieja pero reciente");
    expect(within(tr).getByText("1h ago")).toBeTruthy();
    expect(within(tr).getByText("1mo")).toBeTruthy();
  });

  it("la fila vacía sigue ocupando la tabla entera", async () => {
    // Un colSpan desincronizado con el número de columnas deja la
    // celda de vacío desalineada. No revienta nada, y por eso se olvida.
    montar([]);
    const celda = await screen.findByText(/No matching events|No rules enabled/, {}, { timeout: 4000 });
    const th = document.querySelectorAll("thead th");
    expect(Number(celda.closest("td").getAttribute("colspan"))).toBe(th.length);
  });
});
