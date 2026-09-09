// src/pages/Alerts.unread.test.jsx
//
// El KPI "Unread" y por qué "Mark all seen" no lo apagaba.
//
// Las fuentes de estado —anclas de confianza, cripto débil, hoja de ruta PQC,
// cumplimiento rancio— no son eventos: el backend las sella con la hora de la
// CONSULTA, así que su `occurredAt` es siempre "ahora mismo". Comparado con el
// cursor eso da siempre "no leído", pulses lo que pulses.
//
// `firstSeenAt` —de `alert_occurrences`, que ya mantiene el barrido horario—
// contesta desde cuándo pasa esto de verdad, y es lo que hay que comparar.

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

const CURSOR = "2026-09-08T12:00:00.000Z";
const AHORA = new Date().toISOString();

/** Un ancla de confianza tal y como llega: sellada con la hora de la consulta. */
function anclaVigente(id, firstSeenAt) {
  return {
    source: "cdp_trust_anchor",
    sourceEventId: id,
    occurredAt: AHORA,
    firstSeenAt,
    severity: "high",
    deviceId: "dev-1",
    summary: `Trust anchor ${id}`,
    rule: { id: "r1", templateId: null, name: "Trust anchors" },
    details: {}
  };
}

function montar(items) {
  respond("get", "/api/v1/alerts/rules", {
    rules: [{ id: "r1", name: "Trust anchors", source: "cdp_trust_anchor", enabled: true, severity: "high", criteria: {} }],
    templates: []
  });
  respond("get", "/api/v1/alerts/events", { items, total: items.length, lastSeenAt: CURSOR });
  respond("get", "/api/v1/alerts/unread-count", { count: 0, lastSeenAt: CURSOR });
  respond("post", "/api/v1/alerts/mark-all-seen", { ok: true, lastSeenAt: CURSOR });
  return render(<ConfirmProvider><Alerts /></ConfirmProvider>);
}

/** El valor del KPI "Unread", localizado por su rótulo. */
async function unread() {
  const titulo = await screen.findByText("Unread", {}, { timeout: 4000 });
  const tarjeta = titulo.closest("div")?.parentElement?.parentElement;
  return within(tarjeta).getByText(/^\d+$/).textContent;
}

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
});

describe("KPI Unread — se cuenta por la edad, no por occurredAt", () => {
  it("⭐ un hallazgo permanente ya visto no cuenta, aunque llegue sellado con ahora", async () => {
    // El bug exacto: `occurredAt` es de hace un instante y el cursor es de
    // mediodía, pero lo vimos por primera vez en agosto.
    montar([anclaVigente("a", "2026-08-01T00:00:00.000Z")]);

    await waitFor(async () => expect(await unread()).toBe("0"), { timeout: 4000 });
  });

  it("uno visto DESPUÉS del cursor sí cuenta", async () => {
    montar([anclaVigente("b", "2026-09-08T18:00:00.000Z")]);

    await waitFor(async () => expect(await unread()).toBe("1"), { timeout: 4000 });
  });

  it("sin edad conocida cuenta: se cae a occurredAt, no al silencio", async () => {
    // Recién aparecido, o con el barrido horario todavía sin pasar. Un
    // contador que se calla por no saber es peor que uno que avisa de más.
    montar([anclaVigente("c", null)]);

    await waitFor(async () => expect(await unread()).toBe("1"), { timeout: 4000 });
  });

  it("mezcla: sólo los nuevos, no el total de la lista", async () => {
    montar([
      anclaVigente("a", "2026-08-01T00:00:00.000Z"),
      anclaVigente("b", "2026-09-07T00:00:00.000Z"),
      anclaVigente("c", "2026-09-08T13:00:00.000Z")
    ]);

    await waitFor(async () => expect(await unread()).toBe("1"), { timeout: 4000 });
  });
});
