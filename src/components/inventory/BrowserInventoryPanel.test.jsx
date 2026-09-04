// src/components/inventory/BrowserInventoryPanel.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

describe("BrowserInventoryPanel — el maximo es por plataforma", () => {
  // El caso real del tenant 1: Chrome publica .76 en macOS y .82 en Windows
  // para la MISMA release. El dueno de una Mac al dia reporto que la pantalla
  // decia que estaba atrasado.
  const familiaChrome = {
    family: "Chrome",
    deviceCount: 4,
    latestVersion: "152.0.7977.82",
    behindCount: 1,
    platforms: [
      { platform: "windows", latestVersion: "152.0.7977.82", deviceCount: 2, behindCount: 1 },
      { platform: "macos", latestVersion: "152.0.7977.76", deviceCount: 2, behindCount: 0 },
    ],
    versions: [
      { version: "152.0.7977.82", platform: "windows", deviceCount: 1, outdated: false },
      { version: "152.0.7977.76", platform: "macos", deviceCount: 2, outdated: false },
      { version: "151.0.7922.138", platform: "windows", deviceCount: 1, outdated: true },
    ],
    behindDevices: [
      {
        agentId: "w2",
        hostname: "ETE-2",
        platform: "windows",
        version: "151.0.7922.138",
        latestForPlatform: "152.0.7977.82",
      },
    ],
  };

  function render1() {
    getBrowserInventory.mockResolvedValue({ families: [familiaChrome], totalDevicesWithBrowser: 4 });
    return render(<BrowserInventoryPanel />);
  }

  it("muestra un maximo POR PLATAFORMA, no uno solo", async () => {
    render1();
    expect(await screen.findByText("152.0.7977.82")).toBeTruthy();
    expect(screen.getByText("152.0.7977.76")).toBeTruthy();
    expect(screen.getByText("windows")).toBeTruthy();
    expect(screen.getByText("macos")).toBeTruthy();
  });

  it("⚠️ dice QUE equipos estan atrasados, no solo cuantos", async () => {
    render1();
    const chip = await screen.findByText("1 behind");
    fireEvent.click(chip);
    expect(await screen.findByText("ETE-2")).toBeTruthy();
  });

  it("explica que la comparacion es dentro de la misma plataforma", async () => {
    render1();
    expect(await screen.findByText(/on the same platform/i)).toBeTruthy();
  });
});
