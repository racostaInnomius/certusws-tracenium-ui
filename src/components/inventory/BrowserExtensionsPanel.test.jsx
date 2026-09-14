// src/components/inventory/BrowserExtensionsPanel.test.jsx

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../../api/inventoryDashboard", () => ({
  getBrowserExtensions: vi.fn(),
  getExtensionRules: vi.fn(),
  putExtensionRule: vi.fn(),
  deleteExtensionRule: vi.fn(),
}));
vi.mock("../../api/assetGroups", () => ({ createAssetGroup: vi.fn() }));
import { deleteExtensionRule, getBrowserExtensions, getExtensionRules, putExtensionRule } from "../../api/inventoryDashboard";
import BrowserExtensionsPanel from "./BrowserExtensionsPanel";

beforeEach(() => {
  getExtensionRules.mockResolvedValue({ ok: true, rules: [], windowsDevices: 0 });
});

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

describe("BrowserExtensionsPanel — rules", () => {
  const blockRule = { browser: "chrome", extensionId: grabber.extensionId, action: "block", name: "Coupon Grabber", status: { applied: 3, pending: 1, failed: 1 } };

  it("shows the rule on the row and how far it got across Windows devices", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    getExtensionRules.mockResolvedValue({ ok: true, rules: [blockRule], windowsDevices: 5 });
    render(<BrowserExtensionsPanel canManageRules />);
    fireEvent.click(await screen.findByText("Coupon Grabber"));
    expect(screen.getByText("Blocked by rule")).toBeInTheDocument();
    expect(screen.getByText(/Applied on 3 of 5 Windows devices · 1 pending/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
    // Already blocked: offers Allow and Remove, not Block again.
    expect(screen.queryByRole("button", { name: "Block" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove rule" })).toBeInTheDocument();
  });

  it("blocking asks first, sends the reason, reloads the rules and says when devices get it", async () => {
    const notify = vi.fn();
    getBrowserExtensions.mockResolvedValue(DATA);
    putExtensionRule.mockResolvedValue({ ok: true });
    render(<BrowserExtensionsPanel canManageRules notify={notify} />);
    fireEvent.click(await screen.findByText("Coupon Grabber"));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));

    expect(screen.getByText(/disables and removes it on every Windows device/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reason (kept in the audit log)"), { target: { value: "steals sessions" } });
    fireEvent.click(screen.getByRole("button", { name: "Block extension" }));

    await waitFor(() =>
      expect(putExtensionRule).toHaveBeenCalledWith({ browser: "chrome", extensionId: grabber.extensionId, action: "block", name: "Coupon Grabber", reason: "steals sessions" })
    );
    await waitFor(() => expect(notify).toHaveBeenCalledWith("success", expect.stringMatching(/next check-in/)));
    expect(getExtensionRules).toHaveBeenCalledTimes(2);
  });

  it("a failed save keeps the dialog open and reports the server's message", async () => {
    const notify = vi.fn();
    getBrowserExtensions.mockResolvedValue(DATA);
    putExtensionRule.mockRejectedValue(Object.assign(new Error("x"), { body: { message: "Security Compliance is not included in your plan" } }));
    render(<BrowserExtensionsPanel canManageRules notify={notify} />);
    fireEvent.click(await screen.findByText("Coupon Grabber"));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    fireEvent.click(screen.getByRole("button", { name: "Block extension" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", "Security Compliance is not included in your plan"));
    expect(screen.getByRole("button", { name: "Block extension" })).toBeInTheDocument();
  });

  it("without the capability there are no buttons, only why; Firefox says rules are Chrome/Edge", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    render(<BrowserExtensionsPanel />);
    fireEvent.click(await screen.findByText("Coupon Grabber"));
    expect(screen.queryByRole("button", { name: "Block" })).not.toBeInTheDocument();
    expect(screen.getByText(/needs the Security Compliance capability/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("uBlock Origin"));
    expect(screen.getByText("Rules are available for Chrome and Edge on Windows.")).toBeInTheDocument();
  });

  it("'block all other extensions' warns when nothing is allowed yet, and removing it deletes the * rule", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    deleteExtensionRule.mockResolvedValue({ ok: true });
    render(<BrowserExtensionsPanel canManageRules notify={() => {}} />);
    await screen.findByText("Coupon Grabber");
    fireEvent.click(screen.getAllByRole("button", { name: "Block all other extensions" })[1]);
    expect(screen.getByText(/0 extensions are allowed for Edge right now — allow the ones people need first/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    cleanup();
    getExtensionRules.mockResolvedValue({ ok: true, windowsDevices: 4, rules: [{ browser: "edge", extensionId: "*", action: "block", name: "All other extensions", status: { applied: 4, pending: 0, failed: 0 } }] });
    render(<BrowserExtensionsPanel canManageRules notify={() => {}} />);
    await screen.findByText("Only allowed extensions");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(deleteExtensionRule).toHaveBeenCalledWith("edge", "*"));
  });

  it("if the rules endpoint fails the inventory still renders, without rule controls", async () => {
    getBrowserExtensions.mockResolvedValue(DATA);
    getExtensionRules.mockRejectedValue(new Error("403"));
    render(<BrowserExtensionsPanel canManageRules />);
    fireEvent.click(await screen.findByText("Coupon Grabber"));
    expect(screen.queryByText("Policy")).not.toBeInTheDocument();
    expect(screen.getByText("PC-ANA")).toBeInTheDocument();
  });
});

describe("BrowserExtensionsPanel — deep link from an alert", () => {
  it("?extension=chrome|<id> opens that extension filtered and expanded", async () => {
    window.history.replaceState({}, "", `/?page=assets&assetsTab=software&extension=chrome|${grabber.extensionId}`);
    try {
      getBrowserExtensions.mockResolvedValue(DATA);
      render(<BrowserExtensionsPanel />);
      expect(await screen.findByText("PC-ANA")).toBeInTheDocument();
      expect(screen.queryByText("uBlock Origin")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Search extensions")).toHaveValue(grabber.extensionId);
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });
});
