// src/pages/Alerts.profiles.test.jsx
//
// ADR-0025 F2 — perfiles de notificaciones, en su pestaña de Alerts
// (antes vivían en el drawer "Manage rules", que ya no existe).
//
// Lo caro aquí es silencioso o ruidoso a destiempo:
//   * pedir /notify-profiles o /members sin la capacidad dispara el aviso
//     global de permiso denegado a quien sólo abrió el drawer;
//   * sin `tenant_members`, mandar `members: []` borraría a las personas
//     del perfil sin que nadie lo decidiera;
//   * guardar la entrega de una regla borraba sus `members`.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { clearCachedFetch } from "../hooks/useCachedFetch";
import { clearApiCache } from "../api/http";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

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

const P1 = "11111111-1111-4111-8111-111111111111";
const PROFILE = {
  id: P1,
  name: "IT on-call",
  description: null,
  email: ["soc@cliente.com"],
  members: [],
  roles: ["ADMIN"],
  ruleCount: 1,
};
const TEMPLATE = {
  templateId: "t-offline",
  name: "Device offline",
  source: "device_offline",
  defaultSeverity: "high",
  description: "A device stopped reporting.",
};
const RULE = {
  id: "rule-1",
  templateId: "t-offline",
  name: "Device offline",
  enabled: true,
  severity: "high",
  source: "device_offline",
  criteria: {},
  // `members` puesto por API: el editor no tiene control para él.
  notify: { members: ["sub-1"], roles: ["OWNER"] },
  updatedAt: "2026-09-20T00:00:00Z",
};

afterEach(() => {
  cleanup();
  clearCachedFetch();
  clearApiCache();
  server.resetHandlers();
});

const ROLES = [
  { name: "OWNER", isSystem: true, reachable: 1 },
  { name: "ADMIN", isSystem: true, reachable: 1 },
  { name: "USER", isSystem: true, reachable: 0 },
  { name: "IT Support", isSystem: false, reachable: 1 },
];

function mount({ permissions = ["alerts", "tenant_members"], deleteResponse, rule = RULE } = {}) {
  const calls = [];
  const bodies = {};
  server.use(
    http.all(/.*\/api\/.*/, async ({ request }) => {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      calls.push(`${method} ${path}`);
      const body = ["POST", "PATCH"].includes(method) ? await request.json().catch(() => null) : null;
      if (body) bodies[`${method} ${path}`] = body;

      if (path.endsWith("/roles/me/capabilities")) return HttpResponse.json({ role: "ADMIN", permissions });
      if (path.endsWith("/tenants/1/members")) {
        return HttpResponse.json({
          items: [
            { id: 1, subject: "sub-1", email: "ana@cliente.com", role: "ADMIN", isActive: true },
            { id: 2, subject: "sub-2", email: "luis@cliente.com", role: "USER", isActive: true },
          ],
        });
      }
      if (path.endsWith("/alerts/notify-profiles") && method === "GET") {
        return HttpResponse.json({ ok: true, profiles: [PROFILE] });
      }
      if (path.endsWith("/alerts/notify-profiles") && method === "POST") {
        return HttpResponse.json({ ok: true, profile: { ...PROFILE, ...body, id: "new" } }, { status: 201 });
      }
      if (path.includes("/alerts/notify-profiles/") && method === "DELETE") {
        return deleteResponse ?? HttpResponse.json({ ok: true });
      }
      if (path.endsWith("/alerts/notify-roles")) return HttpResponse.json({ ok: true, roles: ROLES });
      if (path.endsWith("/recipients")) {
        return HttpResponse.json({ ok: true, configured: true, to: ["ana@cliente.com"], missingProfiles: [], truncated: 0 });
      }
      if (path.endsWith("/alerts/rules") && method === "GET") {
        return HttpResponse.json({ ok: true, rules: [rule], templates: [TEMPLATE] });
      }
      if (path.includes("/alerts/rules/") && method === "PATCH") {
        return HttpResponse.json({ ok: true, rule: RULE });
      }
      return HttpResponse.json({ ok: true, items: [], events: [], summary: {}, total: 0, lastSeenAt: null });
    })
  );
  window.history.replaceState({}, "", "/?page=alerts");
  render(
    <ConfirmProvider>
      <Alerts onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
  return { calls, bodies };
}

/** La pestaña Rules; las de perfiles y destinos se abren con su nombre. */
async function openDrawer() {
  await userEvent.click(await screen.findByRole("tab", { name: /^rules$/i }));
}
const profilesTab = () => screen.findByRole("tab", { name: /notification profiles/i });

describe("Alerts — perfiles de notificaciones (ADR-0025)", () => {
  it("⚠️ sin la capacidad `alerts` no hay pestaña, y NO se pide nada que devuelva 403", async () => {
    const { calls } = mount({ permissions: ["assets_view"] });
    await openDrawer();
    await waitFor(() => expect(calls.some((c) => c.endsWith("/roles/me/capabilities"))).toBe(true));

    expect(screen.queryByRole("tab", { name: /notification profiles/i })).not.toBeInTheDocument();
    // Destinations (SIEM) exige la misma capacidad: tampoco aparece.
    expect(screen.queryByRole("tab", { name: /destinations/i })).not.toBeInTheDocument();
    expect(calls.some((c) => c.includes("/notify-profiles"))).toBe(false);
    expect(calls.some((c) => c.includes("/notify-roles"))).toBe(false);
    expect(calls.some((c) => c.includes("/members"))).toBe(false);
    expect(calls.some((c) => c.endsWith("/recipients"))).toBe(false);
  });

  it("con `alerts` enseña los perfiles, con su audiencia y cuántas reglas los usan", async () => {
    mount();
    await openDrawer();
    await userEvent.click(await screen.findByRole("tab", { name: /notification profiles \(1\)/i }));

    expect(await screen.findByText("IT on-call")).toBeInTheDocument();
    expect(screen.getByText(/ADMIN · 1 address/)).toBeInTheDocument();
    expect(screen.getByText("Used by 1 rule")).toBeInTheDocument();
  });

  it("crear un perfil con una persona envía su subject", async () => {
    const { bodies } = mount();
    await openDrawer();
    await userEvent.click(await profilesTab());
    await userEvent.click(screen.getByRole("button", { name: /new profile/i }));

    await userEvent.type(screen.getByRole("textbox", { name: "Profile name" }), "Security");
    await userEvent.click(await screen.findByRole("checkbox", { name: /luis@cliente\.com/ }));
    await userEvent.click(screen.getByRole("button", { name: /create profile/i }));

    await waitFor(() => expect(bodies["POST /api/v1/alerts/notify-profiles"]).toBeDefined());
    expect(bodies["POST /api/v1/alerts/notify-profiles"]).toEqual({
      name: "Security",
      description: null,
      roles: [],
      email: [],
      members: ["sub-2"],
    });
  });

  it("⚠️ sin `tenant_members` no se pide la lista, y el cuerpo NO lleva `members`", async () => {
    // Mandar `members: []` en un PATCH borraría a las personas del perfil.
    const { calls, bodies } = mount({ permissions: ["alerts"] });
    await openDrawer();
    await userEvent.click(await profilesTab());
    await userEvent.click(screen.getByRole("button", { name: /new profile/i }));

    expect(screen.getByText(/You can't list tenant members/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Profile name" }), "SOC");
    await userEvent.type(screen.getByRole("textbox", { name: "Other addresses" }), "soc@cliente.com");
    await userEvent.click(screen.getByRole("button", { name: /create profile/i }));

    await waitFor(() => expect(bodies["POST /api/v1/alerts/notify-profiles"]).toBeDefined());
    expect(bodies["POST /api/v1/alerts/notify-profiles"]).not.toHaveProperty("members");
    expect(calls.some((c) => c.includes("/members"))).toBe(false);
  });

  it("⚠️ borrar un perfil en uso dice qué reglas lo usan", async () => {
    mount({
      deleteResponse: HttpResponse.json(
        { error: "PROFILE_IN_USE", rules: [{ id: "rule-1", name: "Device offline" }] },
        { status: 409 }
      ),
    });
    await openDrawer();
    await userEvent.click(await profilesTab());
    await userEvent.click(await screen.findByRole("button", { name: "Delete IT on-call" }));
    const dialog = await screen.findByRole("dialog", { name: /delete "it on-call"/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /delete profile/i }));

    expect(await screen.findByText(/Still used by 1 rule: Device offline/)).toBeInTheDocument();
  });

  it("⭐ elegir un perfil en la regla lo guarda — y conserva los `members` que el editor no enseña", async () => {
    const { bodies } = mount();
    await openDrawer();
    await userEvent.click(await screen.findByRole("button", { name: "Email…" }));

    // A quién le llega hoy, tal como está guardada.
    expect(await screen.findByText(/Reaches 1 address today: ana@cliente\.com/)).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "IT on-call" }));
    await userEvent.click(screen.getByRole("button", { name: /save delivery/i }));

    await waitFor(() => expect(bodies["PATCH /api/v1/alerts/rules/rule-1"]).toBeDefined());
    const { notify } = bodies["PATCH /api/v1/alerts/rules/rule-1"];
    expect(notify.profiles).toEqual([P1]);
    expect(notify.roles).toEqual(["OWNER"]);
    expect(notify.members).toEqual(["sub-1"]);
  });

  it("⭐ F3: un rol propio del tenant se puede apuntar desde la regla", async () => {
    const { bodies } = mount();
    await openDrawer();
    await userEvent.click(await screen.findByRole("button", { name: "Email…" }));

    // El chip dice a cuántos llega hoy.
    const chip = await screen.findByRole("button", { name: "IT Support" });
    expect(chip).toHaveTextContent("IT Support · 1");
    await userEvent.click(chip);
    await userEvent.click(screen.getByRole("button", { name: /save delivery/i }));

    await waitFor(() => expect(bodies["PATCH /api/v1/alerts/rules/rule-1"]).toBeDefined());
    expect(bodies["PATCH /api/v1/alerts/rules/rule-1"].notify.roles).toEqual(["OWNER", "IT Support"]);
  });

  it("⚠️ un rol guardado que ya no existe se enseña marcado para quitarlo", async () => {
    mount({ rule: { ...RULE, notify: { roles: ["Contractors"] } } });
    await openDrawer();
    await userEvent.click(await screen.findByRole("button", { name: "Email…" }));
    expect(await screen.findByText("Contractors (removed)")).toBeInTheDocument();
  });
});
