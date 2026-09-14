// src/components/inventory/BrowserExtensionsPanel.test.jsx
//
// Inventario de extensiones en Asset Management: neutro y plegado. El total a
// la vista; el detalle al desplegar. Nada de riesgo ni de reglas aquí — eso es
// Security Compliance y Patch Management.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/inventoryDashboard", () => ({ getBrowserExtensions: vi.fn() }));
vi.mock("../../api/assetGroups", () => ({ createAssetGroup: vi.fn() }));
import { getBrowserExtensions } from "../../api/inventoryDashboard";
import BrowserExtensionsPanel from "./BrowserExtensionsPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ext = (over) => ({
  browser: "chrome", extensionId: "a".repeat(32), name: "Coupon Grabber", versions: ["3.1"], devices: 2, installs: 3, enabledInstalls: 2, users: 3,
  sources: ["sideloaded"], permissions: ["cookies"], hostPermissions: ["<all_urls>"],
  risk: { level: "critical", score: 90, reasons: [{ code: "all_sites_control", level: "critical", label: "Can read and change data on all websites" }] },
  installList: [
    { agentId: "a1", hostname: "PC-ANA", osUser: "ana", profile: "Default", version: "3.1", enabled: true, installSource: "sideloaded", riskLevel: "critical" },
    { agentId: "a2", hostname: "PC-LUIS", osUser: "luis", profile: "Profile 1", version: "3.1", enabled: false, installSource: "sideloaded", riskLevel: "critical" },
  ],
  installListTruncated: false, ...over,
});
const DATA = {
  ok: true, available: true,
  extensions: [ext(), ext({ browser: "firefox", extensionId: "uBlock0@raymondhill.net", name: "uBlock Origin", devices: 5, installs: 5, enabledInstalls: 5, users: 5, sources: ["store"], risk: { level: "low", reasons: [] }, installList: [] })],
  coverage: { collected: 7, unsupported: 3, unavailable: 0 },
  totals: { installs: 8, extensions: 2, byLevel: { critical: 1, low: 1 } },
};

describe("BrowserExtensionsPanel (inventory)", () => {
  it("collapsed: only the total found, installs and coverage — the table is not rendered", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    render(<BrowserExtensionsPanel />);
    expect(await screen.findByText("2 found")).toBeInTheDocument();
    expect(screen.getByText("8 installs · 7 devices read · 3 Linux not read")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Browser extensions/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("expanded: neutral table ordered by presence, no risk levels and no rule actions", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    render(<BrowserExtensionsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Browser extensions/ }));
    const names = screen.getAllByText(/Coupon Grabber|uBlock Origin/).map((n) => n.textContent);
    expect(names[0]).toBe("uBlock Origin"); // 5 devices before 2
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Block" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText(/risk lives in Security Compliance/)).toBeInTheDocument();
  });

  it("a row expands to where it is installed, with a group button; search filters", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    render(<BrowserExtensionsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Browser extensions/ }));
    fireEvent.click(screen.getByText("Coupon Grabber"));
    expect(screen.getByText("PC-ANA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /group/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search extensions"), { target: { value: "ublock" } });
    expect(screen.queryByText("Coupon Grabber")).not.toBeInTheDocument();
  });

  it("empty and unavailable states say why", async () => {
    getBrowserExtensions.mockResolvedValue({ ...DATA, available: false, extensions: [] });
    render(<BrowserExtensionsPanel />);
    expect(await screen.findByText("not enabled on this server yet")).toBeInTheDocument();
    cleanup();
    getBrowserExtensions.mockResolvedValue({ ...DATA, extensions: [], coverage: { collected: 0, unsupported: 2 } });
    render(<BrowserExtensionsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Browser extensions/ }));
    expect(screen.getByText(/No device has reported its browser extensions yet/)).toBeInTheDocument();
  });

  it("loads once across re-renders with a new inline notify; a failure goes to notify", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    const { rerender } = render(<BrowserExtensionsPanel notify={() => {}} />);
    await screen.findByText("2 found");
    rerender(<BrowserExtensionsPanel notify={() => {}} />);
    expect(getBrowserExtensions).toHaveBeenCalledTimes(1);
    cleanup();
    const notify = vi.fn();
    getBrowserExtensions.mockRejectedValue(new Error("boom"));
    render(<BrowserExtensionsPanel notify={notify} />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", "boom"));
  });
});
