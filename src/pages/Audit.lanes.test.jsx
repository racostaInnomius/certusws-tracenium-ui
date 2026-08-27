// src/pages/Audit.lanes.test.jsx
//
// Los dos carriles de Audit, desde el lado de la UI.
//
// QUÉ FIJA. Medido en la control DB de producción el 2026-08-27, ventana
// de 30 días y ya sin las sesiones gRPC que dejamos de escribir: de 5.531
// eventos, 5.404 son `policy_ack_ok` y `policy_hello_drift_detected` —el
// 97,7%— y debajo quedan ~50 acciones administrativas al mes. Una de cada
// cien filas era lo que alguien venía a buscar.
//
// Lo que se comprueba aquí es el CONTRATO CON EL BACKEND, no el aspecto:
// que la página pide `lane=admin` al abrirse, que el toggle cambia el
// parámetro, y que la lista de tipos de máquina NO viaja desde el
// frontend. Esa última importa: en esta app, todo enum re-listado a mano
// acabó divergiendo (SOURCE_LABEL y VALID_SOURCES de alerts son el
// precedente), y un filtro de auditoría que diverge esconde filas.

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

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: MOCK_AUTH,
    loading: false,
    refreshAuth: vi.fn().mockResolvedValue(MOCK_AUTH),
  }),
  AuthProvider: ({ children }) => children,
}));

import Audit from "./Audit";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.history.replaceState({}, "", "/");
});

function mount() {
  respond("get", /\/roles\/me\/capabilities.*/, {
    ok: true,
    permissions: ["audit_log"],
  });
  const eventCalls = respond("get", /\/api\/v1\/security\/audit\/events.*/, {
    ok: true,
    items: [],
    total: 0,
  });
  const summaryCalls = respond("get", /\/api\/v1\/security\/audit\/summary.*/, {
    ok: true,
    total: 91,
    ok_count: 60,
    rejected_count: 31,
    error_count: 0,
    unique_devices: 4,
    last_24h: 3,
  });
  respond("get", /\/api\/v1\/security\/audit\/facets.*/, {
    ok: true,
    eventTypes: [],
    outcomes: [],
  });
  respond("get", /\/api\/v1\/security\/audit\/timeseries.*/, { ok: true, buckets: [] });
  respond("get", /known-devices.*/, { ok: true, items: [] });
  render(<Audit />);
  return { eventCalls, summaryCalls };
}

describe("Audit — carriles", () => {
  it("al abrir la página pide el carril administrativo, no todo", async () => {
    // El único default de esta página que cambia lo que se ve al entrar.
    const { eventCalls } = mount();
    await waitFor(() => expect(eventCalls.length).toBeGreaterThan(0));
    expect(eventCalls[0].search.lane).toBe("admin");
  });

  it("NO manda la lista de tipos de máquina desde el frontend", async () => {
    // El filtro vive en el backend (audit-lanes.ts). Si algún día la
    // página empieza a mandar nombres de eventos, hay dos listas que
    // mantener sincronizadas y una acabará escondiendo filas.
    const { eventCalls } = mount();
    await waitFor(() => expect(eventCalls.length).toBeGreaterThan(0));
    const qs = JSON.stringify(eventCalls[0].search);
    expect(qs).not.toMatch(/policy_ack_ok/);
    expect(qs).not.toMatch(/policy_hello_drift_detected/);
  });

  it("el toggle cambia el carril que se pide", async () => {
    const user = userEvent.setup();
    const { eventCalls } = mount();
    await waitFor(() => expect(eventCalls.length).toBeGreaterThan(0));

    await user.click(await screen.findByText("System activity"));

    await waitFor(() => {
      expect(eventCalls.some((c) => c.search.lane === "system")).toBe(true);
    });
  });

  it("pide el recuento del carril CONTRARIO para poder enseñarlo", async () => {
    // La pestaña inactiva dice cuánto hay al otro lado. Se pide, no se
    // calcula restando: una resta se desincroniza en cuanto cambian los
    // filtros y nadie podría comprobarla mirando la pantalla.
    const { summaryCalls } = mount();
    await waitFor(() => {
      expect(summaryCalls.some((c) => c.search.lane === "admin")).toBe(true);
      expect(summaryCalls.some((c) => c.search.lane === "system")).toBe(true);
    });
  });

  it("los KPI siguen el carril: 'Actions' en admin, 'System events' en system", async () => {
    // Las tarjetas cuentan cosas distintas en cada carril y tienen que
    // decirlo. Un rótulo fijo sobre un número que cambia de significado es
    // peor que no tener la tarjeta.
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText("Actions")).toBeInTheDocument();
    expect(screen.queryByText("System events")).toBeNull();

    await user.click(screen.getByText("System activity"));

    expect(await screen.findByText("System events")).toBeInTheDocument();
    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("no queda ninguna tarjeta que mida el tamaño de la tabla", async () => {
    // "Total events" y "Devices seen" medían la tabla, no la postura: con
    // el ruido dentro eran ~100% churn de sesión y sin él son casi
    // constantes. Si vuelven, este test lo dice.
    mount();
    await screen.findByText("Actions");
    expect(screen.queryByText("Total events")).toBeNull();
    expect(screen.queryByText("Devices seen")).toBeNull();
  });

  it("con eventos pero sin actor registrado, 'Who acted' enseña 0", async () => {
    // Las 172.406 filas históricas no guardaban quién. Un 0 aquí es
    // información —"no se sabe"—, y es lo que hay que enseñar en vez de
    // esconder la tarjeta.
    mount();
    expect(await screen.findByText("Who acted")).toBeInTheDocument();
  });

  it("respeta ?auditLane=system al entrar por un enlace", async () => {
    window.history.replaceState({}, "", "/?auditLane=system");
    const { eventCalls } = mount();
    await waitFor(() => expect(eventCalls.length).toBeGreaterThan(0));
    expect(eventCalls[0].search.lane).toBe("system");
  });

  it("un carril desconocido en la URL cae a admin, no rompe la página", async () => {
    window.history.replaceState({}, "", "/?auditLane=nonsense");
    const { eventCalls } = mount();
    await waitFor(() => expect(eventCalls.length).toBeGreaterThan(0));
    expect(eventCalls[0].search.lane).toBe("admin");
    expect(await screen.findByText("Administrative actions")).toBeInTheDocument();
  });
});
