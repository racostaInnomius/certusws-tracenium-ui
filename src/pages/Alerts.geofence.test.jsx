// La alerta de geocerca, vista desde "Manage alert rules".
//
// ⚠️ EL PANEL SE GENERA DEL CATÁLOGO, PERO EL RÓTULO NO. Las plantillas llegan
// del backend y su interruptor aparece solo; el nombre visible de la FUENTE, en
// cambio, vive en `SOURCE_LABEL` de esta página. Olvidarlo es exactamente cómo
// `compliance_stale`, `software_change` y las dos fuentes de CDP se quedaron
// sin etiqueta —y sin filtro— durante semanas.
//
// Y el interruptor importa: es lo que el cliente pidió, "que se pueda encender
// desde Manage alert rules", así que aquí se comprueba que encenderlo crea la
// regla con la plantilla y los criterios de la plantilla, no con unos vacíos.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { clearCachedFetch } from "../hooks/useCachedFetch";

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

import Alerts from "./Alerts";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
});

const PLANTILLA = {
  templateId: "geofence.device_left",
  name: "Device left a geofence",
  description:
    "Fires when a device that was confirmed inside one of your monitored sites is then confirmed outside it.",
  source: "geofence_transition",
  defaultSeverity: "medium",
  defaultCriteria: { directions: ["left"] },
};

function montar({ rules = [] } = {}) {
  const posts = [];
  server.use(
    http.post(/.*\/api\/v1\/alerts\/rules$/, async ({ request }) => {
      posts.push(await request.json());
      return HttpResponse.json({ ok: true, rule: { id: "r-1" } });
    }),
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/alerts/rules")) {
        return HttpResponse.json({ ok: true, templates: [PLANTILLA], rules });
      }
      return HttpResponse.json({
        ok: true, items: [], events: [], rules: [], templates: [],
        summary: {}, total: 0, lastSeenAt: null,
      });
    })
  );
  window.history.replaceState({}, "", "/?page=alerts");
  render(<Alerts onNavigate={vi.fn()} />);
  return posts;
}

describe("Alerts — geocercas", () => {
  it("⭐ la plantilla sale en Manage alert rules y su interruptor la crea", async () => {
    const posts = montar();
    await userEvent.click(await screen.findByRole("button", { name: /manage rules/i }));

    expect(await screen.findByText("Device left a geofence")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Device left a geofence/i }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      templateId: "geofence.device_left",
      source: "geofence_transition",
      severity: "medium",
      // ⚠️ Los criterios de la plantilla viajan enteros: sin ellos la regla
      // avisaría de CUALQUIER transición, y la carga inicial de una cerca son
      // decenas de eventos el mismo día (41 en T111).
      criteria: { directions: ["left"] },
      enabled: true,
    });
  });

  it("⚠️ la fuente tiene rótulo propio: sin él la alerta se lee 'geofence_transition'", async () => {
    montar({
      rules: [{
        id: "r-1", templateId: "geofence.device_left", name: "Device left a geofence",
        enabled: true, severity: "medium", source: "geofence_transition",
        criteria: { directions: ["left"] }, notify: {},
      }],
    });
    await userEvent.click(await screen.findByRole("button", { name: /manage rules/i }));

    const etiquetas = [...document.querySelectorAll(".MuiChip-label")].map((c) => c.textContent);
    expect(etiquetas).toContain("Geofence");
    expect(etiquetas).not.toContain("geofence_transition");
  });
});
