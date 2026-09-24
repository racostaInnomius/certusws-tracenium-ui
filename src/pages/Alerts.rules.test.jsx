// src/pages/Alerts.rules.test.jsx
//
// La pestaña Rules: el catálogo agrupado por plugin y gateado por lo que el
// tenant tiene DISPONIBLE (contratado y habilitado). El backend decide el
// plugin de cada regla y cuáles están pausadas; aquí se comprueba que la
// pantalla lo dice y no deja encender lo que la API va a rechazar.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { clearCachedFetch } from "../hooks/useCachedFetch";
import { clearApiCache } from "../api/http";

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

const CATALOG = [
  { key: "amp", label: "AMP", title: "Asset Management", required: true },
  { key: "scp", label: "SCP", title: "Security Compliance" },
  { key: "cdp", label: "CDP", title: "Crypto Discovery" },
];
const TEMPLATES = [
  { templateId: "offline", name: "Device offline", source: "device_offline", plugin: null, defaultSeverity: "high" },
  { templateId: "disk", name: "Disk almost full", source: "disk_capacity", plugin: "amp", defaultSeverity: "high" },
  { templateId: "score", name: "Compliance score dropped", source: "compliance_score", plugin: "scp", defaultSeverity: "medium" },
  { templateId: "cert", name: "Endpoint certificate expiring", source: "cdp_cert_expiry", plugin: "cdp", defaultSeverity: "high" },
  { templateId: "weak", name: "Weak crypto", source: "cdp_weak_crypto", plugin: "cdp", defaultSeverity: "medium" },
];
const RULES = [
  // Encendida antes de perder CDP: el backend la marca pausada.
  { id: "r-cert", templateId: "cert", name: "Endpoint certificate expiring", enabled: true, paused: true,
    plugin: "cdp", source: "cdp_cert_expiry", severity: "high", notify: {} },
  // Destinatario puesto, pero la matriz sólo manda a consola: parece
  // configurada y no envía nada.
  { id: "r-off", templateId: "offline", name: "Device offline", enabled: true, paused: false,
    plugin: null, source: "device_offline", severity: "high",
    notify: {
      email: ["ops@cliente.com"],
      minSeverity: "low",
      channels: { low: ["console"], medium: ["console"], high: ["console"], critical: ["console"] },
    } },
];
const AVAILABILITY = {
  amp: { available: true, reason: null, tierRequired: null },
  scp: { available: false, reason: "disabled", tierRequired: null },
  cdp: { available: false, reason: "not_entitled", tierRequired: "business" },
};

afterEach(() => {
  cleanup();
  clearCachedFetch();
  clearApiCache();
  server.resetHandlers();
});

function mount(onNavigate = vi.fn()) {
  const patches = [];
  server.use(
    http.all(/.*\/api\/.*/, async ({ request }) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith("/plugins/catalog")) return HttpResponse.json({ ok: true, catalog: CATALOG, entitled: ["amp", "scp"] });
      if (path.endsWith("/roles/me/capabilities")) return HttpResponse.json({ role: "ADMIN", permissions: [] });
      if (path.endsWith("/alerts/rules")) {
        return HttpResponse.json({ ok: true, templates: TEMPLATES, rules: RULES, pluginAvailability: AVAILABILITY });
      }
      if (request.method === "PATCH") {
        patches.push({ path, body: await request.json() });
        return HttpResponse.json({ ok: true, rule: {} });
      }
      return HttpResponse.json({ ok: true, items: [], events: [], summary: {}, total: 0, lastSeenAt: null });
    })
  );
  window.history.replaceState({}, "", "/?page=alerts&alertsTab=rules");
  render(<Alerts onNavigate={onNavigate} />);
  return { patches };
}

const group = (title) => screen.findByRole("region", { name: `${title} alert rules` });

describe("Alerts — reglas agrupadas por plugin", () => {
  it("⭐ cada regla vive en el grupo de su plugin, con cuántas están encendidas", async () => {
    mount();
    const platform = await group("Platform");
    expect(within(platform).getByRole("checkbox", { name: "Device offline" })).toBeChecked();
    expect(within(platform).getByText("1 of 1 on")).toBeInTheDocument();
    const amp = await group("Asset Management");
    expect(within(amp).getByText("Disk almost full")).toBeInTheDocument();
    expect(within(amp).getByText("AMP")).toBeInTheDocument();
  });

  it("⚠️ un plugin no contratado dice qué plan hace falta y no deja encender sus reglas", async () => {
    mount();
    const cdp = await group("Crypto Discovery");
    expect(within(cdp).getByText("Requires the Business plan")).toBeInTheDocument();
    // Plegado de entrada: es referencia, no algo sobre lo que actuar.
    expect(within(cdp).queryByText("Weak crypto")).not.toBeInTheDocument();
    await userEvent.click(within(cdp).getByRole("button", { name: /expand crypto discovery/i }));

    expect(within(cdp).getByRole("checkbox", { name: "Weak crypto" })).toBeDisabled();
  });

  it("⭐ la regla que ya estaba encendida sale PAUSADA, y apagarla sí se puede", async () => {
    const { patches } = mount();
    const cdp = await group("Crypto Discovery");
    expect(within(cdp).getByText("1 of 2 on · 1 paused")).toBeInTheDocument();
    await userEvent.click(within(cdp).getByRole("button", { name: /expand crypto discovery/i }));

    expect(within(cdp).getByText("Paused — plugin not available")).toBeInTheDocument();
    // Pausada sigue siendo configurable: lo guardado se conserva para cuando
    // el plugin vuelva.
    expect(within(cdp).getByRole("button", { name: /email…/i })).toBeInTheDocument();
    const sw = within(cdp).getByRole("checkbox", { name: "Endpoint certificate expiring" });
    expect(sw).toBeEnabled();
    await userEvent.click(sw);
    expect(patches).toEqual([{ path: "/api/v1/alerts/rules/r-cert", body: { enabled: false } }]);
  });

  it("un plugin contratado pero apagado lleva a Agent Settings", async () => {
    const onNavigate = vi.fn();
    mount(onNavigate);
    const scp = await group("Security Compliance");
    expect(within(scp).getByText("Turned off in Agent Settings")).toBeInTheDocument();
    await userEvent.click(within(scp).getByRole("button", { name: /open agent settings/i }));
    expect(onNavigate).toHaveBeenCalledWith("agent-settings");
  });

  it("los grupos bloqueados van al final", async () => {
    mount();
    await group("Platform");
    const titles = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(titles).toEqual([
      "Platform alert rules",
      "Asset Management alert rules",
      "Security Compliance alert rules",
      "Crypto Discovery alert rules",
    ]);
  });

  it("⭐ toda regla encendida tiene su control de entrega — y la plantilla apagada dice cómo tenerlo", async () => {
    mount();
    const platform = await group("Platform");
    // La regla existe: su entrega se puede configurar aquí mismo.
    expect(within(platform).getByRole("button", { name: /email…/i })).toBeInTheDocument();

    const amp = await group("Asset Management");
    // La plantilla sin regla no puede tener entrega (no hay a qué colgarla),
    // y lo dice en vez de callar.
    expect(within(amp).queryByRole("button", { name: /email…/i })).not.toBeInTheDocument();
    expect(within(amp).getByText("Switch it on to choose who is emailed.")).toBeInTheDocument();
  });

  it("⭐ avisa cuando hay destinatarios pero la matriz no manda nada por correo", async () => {
    mount();
    const platform = await group("Platform");
    await userEvent.click(within(platform).getByRole("button", { name: /email…/i }));

    const aviso = await within(platform).findByRole("alert");
    expect(aviso).toHaveTextContent("1 recipient gets nothing");
    expect(aviso).toHaveTextContent("Turn Email on for at least one severity");
  });

  it("el KPI 'Active rules' no cuenta la pausada: el backend no la evalúa", async () => {
    mount();
    await group("Platform");
    expect(screen.getByText("2 total · 1 paused")).toBeInTheDocument();
  });
});
