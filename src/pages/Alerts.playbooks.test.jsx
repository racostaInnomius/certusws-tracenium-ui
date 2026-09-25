// src/pages/Alerts.playbooks.test.jsx
//
// ADR-0034 F2 — la pestaña Playbooks vive en Alertas (ahí está su disparador)
// y sólo con la capacidad `playbooks`.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("../msp/MspContext", () => ({ useMspOptional: () => ({ activeTenant: null }) }));

import Alerts from "./Alerts";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
});

function mount(permissions) {
  server.use(
    http.all(/.*\/api\/.*/, () =>
      HttpResponse.json({ ok: true, items: [], events: [], rules: [], templates: [], playbooks: [], summary: {}, total: 0, lastSeenAt: null, permissions })
    )
  );
  window.history.replaceState({}, "", "/?page=alerts&alertsTab=playbooks");
  render(<Alerts onNavigate={vi.fn()} />);
}

describe("Alerts — pestaña Playbooks", () => {
  it("⭐ con la capacidad `playbooks` aparece la pestaña y su panel", async () => {
    mount(["alerts", "playbooks"]);
    expect(await screen.findByRole("tab", { name: /playbooks/i })).toBeTruthy();
    expect(await screen.findByTestId("playbooks-tab")).toBeInTheDocument();
  });

  it("⚠️ sin ella no hay pestaña ni panel (no se ofrece una puerta que da 403)", async () => {
    mount(["alerts"]);
    await waitFor(() => expect(screen.getByRole("tab", { name: /^alerts$/i })).toBeTruthy());
    expect(screen.queryByRole("tab", { name: /playbooks/i })).toBeNull();
    expect(screen.queryByTestId("playbooks-tab")).toBeNull();
  });
});
