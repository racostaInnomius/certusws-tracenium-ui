// Software Inventory: las tarjetas vienen de /software-inventory/insights y
// sus acciones llegan de verdad a su destino (no sólo que se pinten).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { clearCachedFetch } from "../hooks/useCachedFetch";

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: "1", tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import SoftwareInventory from "./SoftwareInventory";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
  window.history.replaceState({}, "", "/");
});

function mount(props = {}) {
  const puts = [];
  let authorized = ["logmein"];
  server.use(
    http.put(/.*\/software-inventory\/remote-access\/authorized$/, async ({ request }) => {
      const body = await request.json();
      puts.push(body);
      authorized = body.tools;
      return HttpResponse.json({ authorizedKeys: authorized });
    }),
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/software-inventory/insights")) {
        return HttpResponse.json({
          fleetDevices: 57,
          vulnerable: { affectedDevices: 25, critical: 234, high: 1056, knownExploited: 9, kevOverdue: 9, notEvaluableCves: 0 },
          vulnerableUnavailable: null,
          remoteAccess: {
            tools: [
              { key: "rustdesk", label: "RustDesk", authorized: authorized.includes("rustdesk"), devices: 6, hosts: ["PC-1"] },
              { key: "logmein", label: "LogMeIn / GoTo Resolve", authorized: authorized.includes("logmein"), devices: 42, hosts: ["PC-1"] },
            ],
            unauthorizedDevices: authorized.includes("rustdesk") ? 0 : 6,
            authorizedKeys: authorized,
            settingsAvailable: true,
          },
          rareApps: { apps: 0, singleDevice: 0, devices: 0, maxDevices: 2, items: [] },
          freshness: { fleetDevices: 57, upToDate: 57, staleAfterDays: 7, stale: [] },
        });
      }
      if (url.pathname.endsWith("/software-inventory/rankings")) {
        return HttpResponse.json({
          topInstalledApps: [{ label: "Google Chrome", value: 14 }],
          topPublishers: [{ label: "Microsoft", value: 197 }],
          topPublishersUnattributed: { apps: 424, storePublisherIdOnly: 352 },
          topPublishersDistinct: 1,
          behindNewest: [{ label: "RingCentral", deviceCount: 30, behind: 20, newest: "26.3.3012" }],
          behindNewestDistinct: 1,
          appsPerDeviceBuckets: [{ label: "< 25", count: 1 }, { label: "25–49", count: 3 }, { label: "200+", count: 1 }],
          appsPerDeviceMedian: 31,
        });
      }
      return HttpResponse.json({ ok: true, items: [], total: 0, permissions: ["assets_view"] });
    })
  );
  render(<SoftwareInventory {...props} />);
  return puts;
}

describe("SoftwareInventory — tarjetas y gráficos", () => {
  it("⭐ las tarjetas salen de /insights y ya no hay contadores sueltos", async () => {
    mount();
    expect(await screen.findByText("9 actively exploited (KEV) — all past due")).toBeInTheDocument();
    expect(screen.queryByText("Devices Reporting Software")).toBeNull();
  });

  it("⭐ «Open Vulnerabilities» abre Patch Management en su pestaña de vulnerabilidades", async () => {
    const onNavigate = vi.fn();
    mount({ onNavigate });
    await userEvent.click(await screen.findByRole("button", { name: /Open Vulnerabilities/ }));
    expect(onNavigate).toHaveBeenCalledWith("patch");
    expect(new URLSearchParams(window.location.search).get("pmTab")).toBe("vulnerabilities");
  });

  it("⭐ un admin autoriza RustDesk: viaja el PUT y la tarjeta se recarga", async () => {
    const puts = mount({ canAdminister: true });
    await userEvent.click(await screen.findByRole("button", { name: /See devices/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByLabelText("RustDesk is authorized"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect([...puts[0].tools].sort()).toEqual(["logmein", "rustdesk"]);
    expect(await screen.findByText("No unapproved remote-access tools")).toBeInTheDocument();
  });

  it("editores sin identificar como nota, «Behind» en lugar de fragmentación, mediana en el histograma", async () => {
    mount();
    expect(await screen.findByText(/424 apps without an identifiable publisher \(352 Store apps carry only a publisher ID\)/)).toBeInTheDocument();
    expect(screen.getByLabelText("RingCentral: 20 of 30 devices behind")).toBeInTheDocument();
    expect(screen.queryByText("Version fragmentation")).toBeNull();
    expect(screen.getByText(/^Median 31 apps/)).toBeInTheDocument();
    // 5 equipos: el 3.º cae en «25–49».
    expect(screen.getByLabelText("25–49: 3 devices (median)")).toBeInTheDocument();
  });
});
