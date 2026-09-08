// src/components/inventory/BrowserInventoryPanel.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/inventoryDashboard", () => ({ getBrowserInventory: vi.fn() }));
vi.mock("../../api/assetGroups", () => ({ createAssetGroup: vi.fn() }));
import { getBrowserInventory } from "../../api/inventoryDashboard";
import { createAssetGroup } from "../../api/assetGroups";
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

  // ───────────────────────────────────────────────────────────────────
  // Las dos columnas nuevas y la salida hacia Software Delivery.
  // ───────────────────────────────────────────────────────────────────
  const CON_PAQUETE = {
    totalDevicesWithBrowser: 24,
    families: [
      {
        family: "Chrome",
        deviceCount: 24,
        latestVersion: "152.0.7977.76",
        behindCount: 2,
        versions: [],
        distinctVersionCount: 7,
        platforms: [{ platform: "windows", latestVersion: "152.0.7977.76", deviceCount: 24, behindCount: 2 }],
        packaged: [{ platform: "windows", version: "152.0.7977.83", packageId: "5", newerThanFleet: true }],
        behindDevices: [
          { agentId: "a1", hostname: "CHAYBANG", platform: "windows", version: "151.0.7922.170", latestForPlatform: "152.0.7977.76" },
          { agentId: "a2", hostname: "Celina", platform: "windows", version: "152.0.7977.64", latestForPlatform: "152.0.7977.76" },
        ],
      },
      {
        family: "Edge",
        deviceCount: 53,
        latestVersion: "152.0.4191.66",
        behindCount: 34,
        versions: [],
        distinctVersionCount: 10,
        platforms: [{ platform: "windows", latestVersion: "152.0.4191.66", deviceCount: 53, behindCount: 34 }],
        packaged: [],
        behindDevices: [],
      },
    ],
  };

  it("cuenta las versiones en vez de enumerarlas en chips", async () => {
    // Con 500 equipos los chips no caben: Edge ya mostraba "+6 more".
    getBrowserInventory.mockResolvedValue(CON_PAQUETE);
    render(<BrowserInventoryPanel />);

    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it("muestra la versión empaquetada y marca cuando es más nueva que la flota", async () => {
    getBrowserInventory.mockResolvedValue(CON_PAQUETE);
    render(<BrowserInventoryPanel />);

    expect(await screen.findByText(/152\.0\.7977\.83/)).toBeInTheDocument();
  });

  it("⚠️ 'not packaged' es una respuesta: 34 atrasados y nada que empujarles", async () => {
    getBrowserInventory.mockResolvedValue(CON_PAQUETE);
    render(<BrowserInventoryPanel />);

    expect(await screen.findByText("not packaged")).toBeInTheDocument();
  });

  it("⚠️ desde la lista de atrasados se crea el grupo que consume Software Delivery", async () => {
    // Aquí terminaba el callejón: el listado decía QUÉ equipos y lo siguiente
    // era copiarlos a mano. Con 230 nadie lo hace.
    createAssetGroup.mockResolvedValue({ id: 42, name: "x" });
    getBrowserInventory.mockResolvedValue(CON_PAQUETE);
    const notify = vi.fn();
    render(<BrowserInventoryPanel notify={notify} />);

    fireEvent.click(await screen.findByText("2 behind"));
    fireEvent.click(await screen.findByText(/Create device group \(2\)/));
    fireEvent.click(await screen.findByText("Create group"));

    await waitFor(() => expect(createAssetGroup).toHaveBeenCalled());
    const payload = createAssetGroup.mock.calls[0][0];
    expect(payload.kind).toBe("static");
    expect(payload.deviceIds).toEqual(["a1", "a2"]);
    // ⚠️ El nombre lleva la fecha: un grupo estático es una foto, y quien lo
    // despliegue dentro de un mes tiene que poder verlo en el nombre.
    expect(payload.name).toMatch(/Chrome behind · \d{4}-\d{2}-\d{2}/);
    expect(payload.description).toMatch(/does not refresh/);
  });
});
