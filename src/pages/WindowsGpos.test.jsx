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

// ⚠️ Los dos equipos sin directivas de T111 son casos OPUESTOS, medido el
// 04-sep: MSIG-VEEAM-PC esta unido a mountainside-investment.com y aun asi no
// recibe ninguna (averia), y DESKTOP-ANH1JCN es workgroup (correcto).
const conDominio = {
  summary: {
    devicesReporting: 50,
    withComputerGpos: 48,
    withUserGpos: 0,
    withoutAnyGpos: 2,
    domainJoinedWithoutGpos: 1,
    notDomainJoinedWithoutGpos: 1,
    domainUnknown: 0,
    distinctGpos: 6,
  },
  gpos: [{ name: "Default Domain Policy", devices: 48, computer: 48, user: 0 }],
  devices: [
    { agentId: "a", hostname: "MSIG-FIN", osFullVersion: "Windows 11 Pro", computerGpos: ["Default Domain Policy"], userGpos: [], partOfDomain: true, domain: "mountainside-investment.com", collectedAt: null },
    { agentId: "b", hostname: "MSIG-VEEAM-PC", osFullVersion: "Windows 11 Pro for Workstations", computerGpos: [], userGpos: [], partOfDomain: true, domain: "mountainside-investment.com", collectedAt: null },
    { agentId: "c", hostname: "DESKTOP-ANH1JCN", osFullVersion: "Windows 11 Pro", computerGpos: [], userGpos: [], partOfDomain: false, domain: null, collectedAt: null },
  ],
};

const sinDominio = {
  summary: {
    devicesReporting: 8,
    withComputerGpos: 0,
    withUserGpos: 0,
    withoutAnyGpos: 8,
    domainJoinedWithoutGpos: 0,
    notDomainJoinedWithoutGpos: 8,
    domainUnknown: 0,
    distinctGpos: 0,
  },
  gpos: [],
  devices: [{ agentId: "x", hostname: "WKG-1", osFullVersion: "Windows 11 Pro", computerGpos: [], userGpos: [], partOfDomain: false, domain: null, collectedAt: null }],
};

// El estado del dia siguiente a la migracion 20260904: los hallazgos abiertos
// todavia no traen partOfDomain.
const sinDatoDeDominio = {
  ...conDominio,
  summary: {
    ...conDominio.summary,
    domainJoinedWithoutGpos: 0,
    notDomainJoinedWithoutGpos: 0,
    domainUnknown: 50,
  },
  devices: conDominio.devices.map((d) => ({ ...d, partOfDomain: null, domain: null })),
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
    // rompio". Con todos en workgroup, ese cero ES el estado correcto.
    getWindowsGpoInventory.mockResolvedValue(sinDominio);
    render(<WindowsGpos />);
    expect(await screen.findByText(/expected state/i)).toBeTruthy();
  });

  it("⚠️ pero si esos equipos SI estan en dominio, lo llama averia", async () => {
    getWindowsGpoInventory.mockResolvedValue({
      ...sinDominio,
      summary: { ...sinDominio.summary, domainJoinedWithoutGpos: 8, notDomainJoinedWithoutGpos: 0 },
    });
    render(<WindowsGpos />);
    expect(await screen.findByText(/8 of them are joined to a domain/i)).toBeTruthy();
    expect(screen.queryByText(/expected state/i)).toBeNull();
  });
});

describe("WindowsGpos — pertenencia al dominio", () => {
  it("separa el equipo averiado del que esta bien asi", async () => {
    getWindowsGpoInventory.mockResolvedValue(conDominio);
    render(<WindowsGpos />);
    expect(await screen.findByText("1 domain-joined · 1 workgroup")).toBeTruthy();
  });

  it("la tabla dice de que dominio, no solo que si", async () => {
    getWindowsGpoInventory.mockResolvedValue(conDominio);
    render(<WindowsGpos />);
    expect(await screen.findAllByText("mountainside-investment.com")).toBeTruthy();
    expect(screen.getByText("Workgroup")).toBeTruthy();
  });

  it("⚠️ un equipo que aun no lo reporta NO se pinta como workgroup", async () => {
    // Es la confusion que esta pantalla existe para no cometer: leer una
    // ausencia como un `false` convierte un equipo averiado en uno correcto.
    getWindowsGpoInventory.mockResolvedValue(sinDatoDeDominio);
    render(<WindowsGpos />);
    expect(await screen.findAllByText("Not reported")).toBeTruthy();
    expect(screen.queryByText("Workgroup")).toBeNull();
  });

  it("⚠️ y mientras falten datos, la pantalla dice que el conteo es un piso", async () => {
    getWindowsGpoInventory.mockResolvedValue(sinDatoDeDominio);
    render(<WindowsGpos />);
    expect(await screen.findByText(/not report domain membership yet/i)).toBeTruthy();
    expect(screen.getByText(/a floor, not a total/i)).toBeTruthy();
  });

  it("cuando ya se sabe de todos, ese aviso desaparece", async () => {
    getWindowsGpoInventory.mockResolvedValue(conDominio);
    render(<WindowsGpos />);
    await screen.findByText("Without any GPO");
    expect(screen.queryByText(/not report domain membership yet/i)).toBeNull();
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
