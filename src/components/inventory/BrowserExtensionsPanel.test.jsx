// src/components/inventory/BrowserExtensionsPanel.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../../api/inventoryDashboard", () => ({ getBrowserExtensions: vi.fn() }));
vi.mock("../../api/assetGroups", () => ({ createAssetGroup: vi.fn() }));
import { getBrowserExtensions } from "../../api/inventoryDashboard";
import BrowserExtensionsPanel from "./BrowserExtensionsPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const grabber = {
  browser: "chrome",
  extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name: "Coupon Grabber",
  versions: ["3.1"],
  devices: 2,
  installs: 3,
  enabledInstalls: 2,
  users: 3,
  sources: ["sideloaded"],
  permissions: ["cookies"],
  hostPermissions: ["<all_urls>"],
  risk: {
    level: "critical",
    score: 90,
    reasons: [
      { code: "all_sites_control", level: "critical", label: "Can read and change data on all websites, and cookies lets it act on that (session theft, injected code)" },
      { code: "sideloaded", level: "medium", label: "Installed by other software, not from a store" },
    ],
  },
  installList: [
    { agentId: "a1", hostname: "PC-ANA", osUser: "ana", profile: "Default", version: "3.1", enabled: true, installSource: "sideloaded", riskLevel: "critical" },
    { agentId: "a2", hostname: "PC-LUIS", osUser: "luis", profile: "Profile 1", version: "3.1", enabled: false, installSource: "sideloaded", riskLevel: "critical" },
  ],
  installListTruncated: false,
};
const ublock = {
  browser: "firefox",
  extensionId: "uBlock0@raymondhill.net",
  name: "uBlock Origin",
  versions: ["1.60.0", "1.61.0"],
  devices: 5,
  installs: 5,
  enabledInstalls: 5,
  users: 5,
  sources: ["store"],
  permissions: ["storage"],
  hostPermissions: [],
  risk: { level: "low", score: 10, reasons: [] },
  installList: [],
  installListTruncated: false,
};
const DATA = {
  ok: true,
  available: true,
  extensions: [grabber, ublock],
  coverage: { collected: 7, unsupported: 3, unavailable: 1 },
  totals: { installs: 8, extensions: 2, byLevel: { critical: 1, high: 0, medium: 0, low: 1 } },
};

describe("BrowserExtensionsPanel", () => {
  it("lists extensions with risk, devices, source and states coverage including unread Linux", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    render(<BrowserExtensionsPanel />);

    expect(await screen.findByText("Coupon Grabber")).toBeInTheDocument();
    expect(screen.getByText("uBlock Origin")).toBeInTheDocument();
    expect(screen.getByText("2 extensions")).toBeInTheDocument();
    expect(screen.getByText("Devices: 7 read · 3 Linux not read · 1 could not be read")).toBeInTheDocument();
    expect(screen.getByText("Other software")).toBeInTheDocument();
    // 3 installs, 2 enabled → 1 disabled, said next to the device count.
    expect(screen.getByText("3 users · 1 disabled")).toBeInTheDocument();
  });

  it("filters by risk level and by search", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    render(<BrowserExtensionsPanel />);
    await screen.findByText("Coupon Grabber");

    fireEvent.click(screen.getByText("Low 1"));
    expect(screen.queryByText("Coupon Grabber")).not.toBeInTheDocument();
    expect(screen.getByText("uBlock Origin")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Low 1"));
    fireEvent.change(screen.getByLabelText("Search extensions"), { target: { value: "coupon" } });
    expect(screen.getByText("Coupon Grabber")).toBeInTheDocument();
    expect(screen.queryByText("uBlock Origin")).not.toBeInTheDocument();
  });

  it("expanding a row shows the reasons and every install, with a group button for those devices", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    render(<BrowserExtensionsPanel />);
    fireEvent.click(await screen.findByText("Coupon Grabber"));

    expect(screen.getByText(/session theft, injected code/)).toBeInTheDocument();
    expect(screen.getByText("PC-ANA")).toBeInTheDocument();
    const luis = screen.getByText("PC-LUIS").parentElement;
    expect(within(luis).getByText(/disabled/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /group/i })).toBeInTheDocument();
  });

  it("says the server does not have it yet instead of an empty table", async () => {
    getBrowserExtensions.mockResolvedValue({ ok: true, available: false, extensions: [], coverage: {}, totals: {} });
    render(<BrowserExtensionsPanel />);
    expect(await screen.findByText("The extension inventory is not enabled on this server yet.")).toBeInTheDocument();
  });

  it("tells 'nobody reported yet' apart from 'read and found none'", async () => {
    getBrowserExtensions.mockResolvedValue({ ...DATA, extensions: [], coverage: { collected: 0, unsupported: 4, unavailable: 0 } });
    render(<BrowserExtensionsPanel />);
    expect(await screen.findByText(/No device has reported its browser extensions yet/)).toBeInTheDocument();
    cleanup();

    getBrowserExtensions.mockResolvedValue({ ...DATA, extensions: [], coverage: { collected: 6, unsupported: 0, unavailable: 0 } });
    render(<BrowserExtensionsPanel />);
    expect(await screen.findByText("No extensions found in the browser profiles the agents read.")).toBeInTheDocument();
  });

  it("loads once even when the page re-renders with a new inline notify", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    const { rerender } = render(<BrowserExtensionsPanel notify={() => {}} />);
    await screen.findByText("Coupon Grabber");
    rerender(<BrowserExtensionsPanel notify={() => {}} />);
    rerender(<BrowserExtensionsPanel notify={() => {}} />);
    expect(getBrowserExtensions).toHaveBeenCalledTimes(1);
  });

  it("reports a load failure through notify", async () => {
    const notify = vi.fn();
    getBrowserExtensions.mockRejectedValue(new Error("boom"));
    render(<BrowserExtensionsPanel notify={notify} />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", "boom"));
  });
});
