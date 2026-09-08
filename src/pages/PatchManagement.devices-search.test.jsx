// src/pages/PatchManagement.devices-search.test.jsx
//
// La tabla de equipos de Patch Management se busca, no se pagina a ciegas.
// T111 tiene 55 equipos en seis páginas; un tenant de 500 no se podía usar.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

let capabilities = { role: "ADMIN", permissions: ["patch_management"] };
vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve(capabilities),
}));
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

import PatchManagement from "./PatchManagement";

const DEVICES = [
  { agentId: "a-1", hostname: "Msig13", platform: "windows", overallStatus: "installing", missingCount: 2, rebootRequired: false, collectedAtUtc: "2026-09-08T00:00:00Z" },
  { agentId: "a-2", hostname: "MSIG-WSUS", platform: "windows", overallStatus: "healthy", missingCount: 0, rebootRequired: true, collectedAtUtc: "2026-09-08T00:00:00Z" },
  { agentId: "a-3", hostname: "srvoc-mainagent", platform: "linux", overallStatus: "updates_available", missingCount: 5, rebootRequired: false, collectedAtUtc: "2026-09-08T00:00:00Z" },
];

beforeEach(() => {
  capabilities = { role: "ADMIN", permissions: ["patch_management"] };
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount() {
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
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

const grid = () => screen.getByRole("grid");

describe("Patch Management — búsqueda en la tabla de equipos", () => {
  it("muestra los equipos y la cuenta total antes de buscar", async () => {
    mount();
    await waitFor(() => expect(within(grid()).getByText("Msig13")).toBeInTheDocument());
    expect(within(grid()).getByText("srvoc-mainagent")).toBeInTheDocument();
    expect(screen.getByText("3 reporting")).toBeInTheDocument();
  });

  it("⭐ escribir estrecha la tabla por hostname y dice cuántos quedan", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(within(grid()).getByText("Msig13")).toBeInTheDocument());

    await user.type(screen.getByRole("textbox", { name: "Search devices" }), "msig");

    await waitFor(() => expect(within(grid()).queryByText("srvoc-mainagent")).not.toBeInTheDocument());
    expect(within(grid()).getByText("Msig13")).toBeInTheDocument();
    expect(within(grid()).getByText("MSIG-WSUS")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 devices")).toBeInTheDocument();
  });

  it("busca también por lo que el operador ve: el estado del chip y la plataforma", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(within(grid()).getByText("Msig13")).toBeInTheDocument());

    const box = screen.getByRole("textbox", { name: "Search devices" });
    await user.type(box, "updates avail");
    await waitFor(() => expect(within(grid()).queryByText("Msig13")).not.toBeInTheDocument());
    expect(within(grid()).getByText("srvoc-mainagent")).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "linux");
    await waitFor(() => expect(within(grid()).queryByText("MSIG-WSUS")).not.toBeInTheDocument());
    expect(within(grid()).getByText("srvoc-mainagent")).toBeInTheDocument();
  });

  it("sin coincidencias lo dice con la consulta, no con un 'No rows' genérico", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(within(grid()).getByText("Msig13")).toBeInTheDocument());

    await user.type(screen.getByRole("textbox", { name: "Search devices" }), "zzz-nothing");

    expect(await screen.findByText("No devices match “zzz-nothing”")).toBeInTheDocument();
    expect(screen.getByText("0 of 3 devices")).toBeInTheDocument();
  });
});
