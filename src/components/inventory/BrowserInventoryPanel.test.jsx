// src/components/inventory/BrowserInventoryPanel.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/inventoryDashboard", () => ({ getBrowserInventory: vi.fn() }));
import { getBrowserInventory } from "../../api/inventoryDashboard";
import BrowserInventoryPanel from "./BrowserInventoryPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DATA = {
  totalDevicesWithBrowser: 5,
  families: [
    {
      family: "Chrome",
      deviceCount: 4,
      latestVersion: "131.0.6778.86",
      behindCount: 2,
      versions: [
        { version: "131.0.6778.86", deviceCount: 2, outdated: false },
        { version: "120.0.6099.109", deviceCount: 2, outdated: true },
      ],
    },
    {
      family: "Firefox",
      deviceCount: 1,
      latestVersion: "121.0",
      behindCount: 0,
      versions: [{ version: "121.0", deviceCount: 1, outdated: false }],
    },
  ],
};

describe("BrowserInventoryPanel", () => {
  it("renders each family with its behind count", async () => {
    getBrowserInventory.mockResolvedValue(DATA);
    render(<BrowserInventoryPanel />);
    expect(await screen.findByText("Chrome")).toBeInTheDocument();
    expect(screen.getByText("Firefox")).toBeInTheDocument();
    expect(screen.getByText("2 behind")).toBeInTheDocument(); // Chrome
    expect(screen.getByText("up to date")).toBeInTheDocument(); // Firefox
    expect(screen.getByText(/5 devices/)).toBeInTheDocument(); // fleet total
  });

  it("shows an empty state when no browsers are detected", async () => {
    getBrowserInventory.mockResolvedValue({ families: [], totalDevicesWithBrowser: 0 });
    render(<BrowserInventoryPanel />);
    expect(await screen.findByText(/No browsers detected/i)).toBeInTheDocument();
  });

  it("surfaces a load error via notify", async () => {
    getBrowserInventory.mockRejectedValue({ body: { message: "boom" } });
    const notify = vi.fn();
    render(<BrowserInventoryPanel notify={notify} />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", "boom"));
  });
});
