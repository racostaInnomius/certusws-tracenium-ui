// src/pages/WindowsGpos.test.jsx
//
// Las cifras son las de produccion medidas el 2026-09-04: T111 con 50 equipos
// reportando, 48 con directivas de equipo, CERO de usuario y 2 sin ninguna.
// T1 con 8 equipos reportando y ni una sola directiva.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api/inventoryDashboard", () => ({ getWindowsGpoInventory: vi.fn() }));
vi.mock("../hooks/useCachedFetch", () => ({
  useCachedFetch: (_k, fn) => {
    const [data, setData] = React.useState(null);
    React.useEffect(() => {
      fn().then(setData);
    }, []);
    return { data, loading: !data, refetch: () => {} };
  },
}));

import * as React from "react";
import { getWindowsGpoInventory } from "../api/inventoryDashboard";
import WindowsGpos from "./WindowsGpos";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const conDominio = {
  summary: { devicesReporting: 50, withComputerGpos: 48, withUserGpos: 0, withoutAnyGpos: 2, distinctGpos: 6 },
  gpos: [{ name: "Default Domain Policy", devices: 48, computer: 48, user: 0 }],
  devices: [
    { agentId: "a", hostname: "MSIG-FIN", osFullVersion: "Windows 11 Pro", computerGpos: ["Default Domain Policy"], userGpos: [], collectedAt: null },
    { agentId: "b", hostname: "MSIG-VEEAM-PC", osFullVersion: "Windows 11 Pro for Workstations", computerGpos: [], userGpos: [], collectedAt: null },
    { agentId: "c", hostname: "DESKTOP-ANH1JCN", osFullVersion: "Windows 11 Pro", computerGpos: [], userGpos: [], collectedAt: null },
  ],
};

const sinDominio = {
  summary: { devicesReporting: 8, withComputerGpos: 0, withUserGpos: 0, withoutAnyGpos: 8, distinctGpos: 0 },
  gpos: [],
  devices: [{ agentId: "x", hostname: "WKG-1", osFullVersion: "Windows 11 Pro", computerGpos: [], userGpos: [], collectedAt: null }],
};

describe("WindowsGpos — el aviso de GPO de usuario", () => {
  it("aparece cuando SI hay directivas de equipo pero ninguna de usuario", async () => {
    getWindowsGpoInventory.mockResolvedValue(conDominio);
    render(<WindowsGpos />);
    expect(await screen.findByText(/User GPOs are not collected yet/i)).toBeTruthy();
  });

  it("⚠️ NO aparece en un tenant sin una sola directiva de equipo", async () => {
    // Ahi no es que falten las de usuario: es que no hay GPO de ninguna clase,
    // y regañar por una limitacion que no aplica es ruido.
    getWindowsGpoInventory.mockResolvedValue(sinDominio);
    render(<WindowsGpos />);
    await screen.findByText(/none has any Group Policy applied/i);
    expect(screen.queryByText(/User GPOs are not collected yet/i)).toBeNull();
  });

  it("⚠️ en su lugar explica por que no hay ninguna", async () => {
    // Tres ceros y una grafica vacia no distinguen "no aplica" de "algo se
    // rompio".
    getWindowsGpoInventory.mockResolvedValue(sinDominio);
    render(<WindowsGpos />);
    expect(await screen.findByText(/not joined to a domain/i)).toBeTruthy();
  });
});

describe("WindowsGpos — los equipos sin ninguna directiva", () => {
  it("se cuentan aparte, no se pierden en la tabla", async () => {
    getWindowsGpoInventory.mockResolvedValue(conDominio);
    render(<WindowsGpos />);
    expect(await screen.findByText("Without any GPO")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("la tarjeta filtra la tabla y dice que esta filtrada", async () => {
    getWindowsGpoInventory.mockResolvedValue(conDominio);
    render(<WindowsGpos />);
    fireEvent.click(await screen.findByText("Without any GPO"));

    // Una tabla filtrada que no lo dice miente sobre el tamano de la flota.
    expect(await screen.findByText(/Without any GPO · 2/)).toBeTruthy();
    expect(screen.queryByText("MSIG-FIN")).toBeNull();
    expect(screen.getByText("MSIG-VEEAM-PC")).toBeTruthy();
  });

  it("volver a pulsar quita el filtro", async () => {
    getWindowsGpoInventory.mockResolvedValue(conDominio);
    render(<WindowsGpos />);
    const tarjeta = await screen.findByText("Without any GPO");
    fireEvent.click(tarjeta);
    await screen.findByText(/Without any GPO · 2/);
    fireEvent.click(tarjeta);
    expect(await screen.findByText("MSIG-FIN")).toBeTruthy();
  });

  it("en cero la tarjeta no ofrece un filtro que daria una tabla vacia", async () => {
    getWindowsGpoInventory.mockResolvedValue({
      ...conDominio,
      summary: { ...conDominio.summary, withoutAnyGpos: 0 },
      devices: [conDominio.devices[0]],
    });
    render(<WindowsGpos />);
    await screen.findByText("Without any GPO");
    const marcadas = screen.queryAllByRole("button").filter((el) => el.getAttribute("aria-pressed") !== null);
    expect(marcadas).toHaveLength(0);
  });
});
