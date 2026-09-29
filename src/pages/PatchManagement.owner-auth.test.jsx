// src/pages/PatchManagement.owner-auth.test.jsx
//
// 🔴 28-sep, JPR-MacBookPro (M3 Pro), job e4689371: «Install» de macOS 27.0.1
// pidió contraseña en el Mac y el job esperó una hora. En Apple silicon el
// agente no puede instalar una actualización del sistema; el portal ya no la
// ofrece como las demás.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve({ role: "ADMIN", permissions: ["patch_management"] }),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 1, tenantMember: { role: "ADMIN", isActive: true, tenantId: 1 } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({ useMspOptional: () => ({ activeTenant: null }) }));

import PatchManagement from "./PatchManagement";
import { clearCachedFetch } from "../hooks/useCachedFetch";

const DEVICES = [
  { agentId: "jpr", hostname: "JPR-MacBookPro", platform: "macos", overallStatus: "updates_available", missingCount: 2, collectedAtUtc: "2026-09-28T00:00:00Z" },
];
const ITEMS = [
  { hotfixId: "Safari27.0TahoeAuto-27.0", title: "Safari", severity: "moderate", source: "apple_software_update", installBlockedReason: null },
  { hotfixId: "macOS 27.0.1-26A434", title: "macOS 27.0.1", severity: "unknown", source: "apple_software_update", installBlockedReason: "owner_authorization_required" },
];

function mount() {
  server.use(
    http.all(/.*\/api\/.*/, async ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/devices/jpr/items")) return HttpResponse.json({ ok: true, agentId: "jpr", items: ITEMS });
      if (url.pathname.endsWith("/orchestrator/devices-connected")) return HttpResponse.json({ ok: true, deviceIds: ["jpr"] });
      if (request.method === "POST" && url.pathname.endsWith("/patch-management/bulk-install")) {
        return HttpResponse.json({
          ok: true,
          plan: [{ agentId: "air", hostname: "MacBook-Air", platform: "macos", kbCount: 1, kbArticleIds: ["Safari27.0TahoeAuto-27.0"], ownerAuthExcluded: ["macOS Tahoe 26.7.1-25G241"] }],
          skipped: [{ agentId: "jpr", hostname: "JPR-MacBookPro", reason: "owner_authorization_required" }],
        });
      }
      const items = url.pathname.endsWith("/patch-management/devices") ? DEVICES : [];
      return HttpResponse.json({
        ok: true,
        items,
        devices: [],
        findings: [],
        catalog: [{ key: "pmp", required: false }],
        policy: { policy_version: 1, policy_hash: "h", policy_json: { plugins: { enabled: ["amp", "pmp"] } } },
        summary: {},
        total: items.length,
      });
    })
  );
  window.history.replaceState({}, "", "/?page=patch");
  render(<ConfirmProvider><PatchManagement onNavigate={vi.fn()} /></ConfirmProvider>);
}

afterEach(() => {
  cleanup();
  server.resetHandlers();
  clearCachedFetch();
});

describe("Patch Management — macOS en Apple silicon", () => {
  it("🔴 el panel del equipo no deja elegir la de macOS y dice por qué", async () => {
    mount();
    fireEvent.click(await screen.findByText("JPR-MacBookPro"));
    const drawer = await screen.findByText("macOS 27.0.1-26A434").then((el) => el.closest(".MuiDrawer-paper"));

    expect(within(drawer).getByText("Install on the Mac")).toBeInTheDocument();
    expect(within(drawer).getByTestId("owner-auth-notice")).toHaveTextContent(/System Settings → General → Software Update/);
    expect(within(drawer).getByRole("checkbox", { name: "Select macOS 27.0.1-26A434" })).toBeDisabled();
    expect(within(drawer).getByRole("checkbox", { name: "Select Safari27.0TahoeAuto-27.0" })).not.toBeDisabled();
  });

  it("«Install all» sólo lleva Safari", async () => {
    mount();
    fireEvent.click(await screen.findByText("JPR-MacBookPro"));
    const drawer = await screen.findByText("macOS 27.0.1-26A434").then((el) => el.closest(".MuiDrawer-paper"));
    fireEvent.click(within(drawer).getByRole("button", { name: /Install all/ }));

    const dialog = await screen.findByRole("dialog", { name: /Install all missing patches/ });
    expect(within(dialog).getByText(/Safari27\.0TahoeAuto-27\.0/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/macOS 27\.0\.1-26A434/)).toBeNull();
  });

  it("la vista previa de flota dice qué Macs se quedan fuera", async () => {
    mount();
    await screen.findByText("JPR-MacBookPro");
    const title = await screen.findByText("Install all other pending updates");
    let row = title.parentElement;
    while (row && !within(row).queryByRole("button", { name: /Remediate/ })) row = row.parentElement;
    fireEvent.click(within(row).getByRole("button", { name: /Remediate/ }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByTestId("bulk-owner-auth")).toHaveTextContent(/macOS updates on 2 Apple silicon Macs are left out/)
    );
    expect(within(dialog).getByText(/Will dispatch to 1 device/)).toBeInTheDocument();
  });
});
