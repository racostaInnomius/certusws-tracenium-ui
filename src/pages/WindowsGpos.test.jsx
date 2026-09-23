// src/pages/WindowsGpos.test.jsx
//
// Las cifras son las de produccion medidas el 2026-09-04: T111 con 50 equipos
// reportando, 48 con directivas de equipo, CERO de usuario y 2 sin ninguna.
// T1 con 8 equipos reportando y ni una sola directiva.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../api/inventoryDashboard", () => ({
  getWindowsGpoInventory: vi.fn(),
  // El panel de cambios vive dentro de esta página y hace su propia
  // llamada: sin este doble, cada test de la tabla fallaría por la red.
  getWindowsGpoChanges: vi.fn().mockResolvedValue({ groups: [], changes: [], windowDays: 30, devicesWithSingleReading: 0 }),
}));
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
import { getWindowsGpoChanges } from "../api/inventoryDashboard";

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
    const rotulo = await screen.findByText("Without any GPO");
    // ⚠️ Acotado a la TARJETA, no a la página: abajo hay un selector de
    // periodo con sus propios `aria-pressed` que no tiene nada que ver con
    // este filtro, y contarlo aquí mediría otra cosa.
    const tarjeta = rotulo.closest("div")?.parentElement ?? document.body;
    const marcadas = within(tarjeta)
      .queryAllByRole("button")
      .filter((el) => el.getAttribute("aria-pressed") !== null);
    expect(marcadas).toHaveLength(0);
  });
});

describe("WindowsGpos — una lectura que fallo", () => {
  // El equipo real: MSIG-VEEAM-PC, con tres directivas aplicadas segun su
  // propio gpresult, que llegaba como lista vacia porque el colector buscaba
  // un encabezado en ingles. Desde el agente 1.1.61 llega null.
  const sinLectura = {
    ...conDominio,
    summary: {
      ...conDominio.summary,
      withoutAnyGpos: 1,
      domainJoinedWithoutGpos: 0,
      notDomainJoinedWithoutGpos: 1,
      withoutGpoData: 1,
    },
    devices: [
      conDominio.devices[0],
      { ...conDominio.devices[1], computerGpos: null, userGpos: null },
      conDominio.devices[2],
    ],
  };

  it("se declara en vez de contarse como equipo sin directivas", async () => {
    getWindowsGpoInventory.mockResolvedValue(sinLectura);
    render(<WindowsGpos />);
    expect(await screen.findByText(/could not report/i)).toBeTruthy();
  });

  it("⚠️ la celda dice 'Not reported', nunca 'None'", async () => {
    getWindowsGpoInventory.mockResolvedValue(sinLectura);
    render(<WindowsGpos />);
    expect(await screen.findAllByText("Not reported")).toBeTruthy();
  });

  it("⚠️ y ese equipo NO entra en el filtro de 'sin ninguna directiva'", async () => {
    getWindowsGpoInventory.mockResolvedValue(sinLectura);
    render(<WindowsGpos />);
    fireEvent.click(await screen.findByText("Without any GPO"));

    await screen.findByText(/Without any GPO · 1/);
    expect(screen.queryByText("MSIG-VEEAM-PC")).toBeNull();
    expect(screen.getByText("DESKTOP-ANH1JCN")).toBeTruthy();
  });

  it("cuando todas las lecturas salen bien, el aviso no aparece", async () => {
    getWindowsGpoInventory.mockResolvedValue({
      ...conDominio,
      summary: { ...conDominio.summary, withoutGpoData: 0 },
    });
    render(<WindowsGpos />);
    await screen.findByText("Without any GPO");
    expect(screen.queryByText(/could not report/i)).toBeNull();
  });
});

// ── ADR-0012 (addendum): la OU y el papel en el dominio ──────────────────
//
// ⚠️ La columna nueva tiene TRES estados y ninguno puede taparse con otro:
// una ruta, «sin OU» (el equipo cuelga del contenedor Computers) y «no
// reportado» (el agente que la manda aún no está desplegado).

const conOu = {
  summary: {
    devicesReporting: 3,
    withComputerGpos: 3,
    withUserGpos: 0,
    withoutAnyGpos: 0,
    domainJoinedWithoutGpos: 0,
    notDomainJoinedWithoutGpos: 0,
    unknownDomainWithoutGpos: 0,
    distinctGpos: 1,
    withOu: 2,
    domainControllers: 1,
  },
  gpos: [{ name: "Default Domain Policy", computer: 3, user: 0, devices: 3 }],
  devices: [
    {
      agentId: "a-1",
      hostname: "Castico-PV",
      osFullVersion: "Windows 11 Pro",
      computerGpos: ["Default Domain Policy"],
      userGpos: [],
      partOfDomain: true,
      domain: "mountainside-investment.com",
      domainRole: { code: 1, label: "Workstation", isDomainController: false },
      ou: "OU=Workstations,OU=CASTICO,DC=mountainside-investment,DC=com",
      ouSegments: ["CASTICO", "Workstations"],
      ouReported: true,
      collectedAt: "2026-09-22T20:27:08.000Z",
    },
    {
      agentId: "a-2",
      hostname: "MSIG-DOMAIN01",
      osFullVersion: "Windows Server 2022",
      computerGpos: ["Default Domain Policy"],
      userGpos: [],
      partOfDomain: true,
      domain: "mountainside-investment.com",
      domainRole: { code: 5, label: "Primary domain controller", isDomainController: true },
      ou: null,
      ouSegments: [],
      ouReported: true,
      collectedAt: "2026-09-22T20:27:08.000Z",
    },
    {
      agentId: "a-3",
      hostname: "SIN-AGENTE-NUEVO",
      osFullVersion: "Windows 10 Pro",
      computerGpos: ["Default Domain Policy"],
      userGpos: [],
      partOfDomain: true,
      domain: "mountainside-investment.com",
      domainRole: null,
      ou: null,
      ouSegments: [],
      ouReported: false,
      collectedAt: "2026-09-22T20:27:08.000Z",
    },
  ],
};

describe("WindowsGpos — OU y rol", () => {
  it("⭐ la OU se lee de la rama general a la concreta", async () => {
    getWindowsGpoInventory.mockResolvedValue(conOu);
    render(<WindowsGpos />);
    expect(await screen.findByText("Workstations")).toBeInTheDocument();
    expect(screen.getByText(/CASTICO ›/)).toBeInTheDocument();
  });

  it("⚠️ «sin OU» y «no reportado» NO son lo mismo", async () => {
    getWindowsGpoInventory.mockResolvedValue(conOu);
    render(<WindowsGpos />);
    // El controlador cuelga del contenedor Computers: reportó, no tiene OU.
    expect(await screen.findByText("No OU")).toBeInTheDocument();
    // El tercero aún no manda el dato: la columna vacía no es culpa suya.
    expect(screen.getByText("Not reported")).toBeInTheDocument();
  });

  it("⭐ un controlador de dominio se marca: sus directivas no son las de una estación", async () => {
    getWindowsGpoInventory.mockResolvedValue(conOu);
    render(<WindowsGpos />);
    expect(await screen.findByText("DC")).toBeInTheDocument();
  });

  it("⚠️ una estación NO se etiqueta: sería ruido en toda la tabla", async () => {
    getWindowsGpoInventory.mockResolvedValue(conOu);
    render(<WindowsGpos />);
    await screen.findByText("Workstations");
    expect(screen.queryByText("Workstation")).not.toBeInTheDocument();
  });
});



// ── ADR-0012 (addendum): mirar UNA directiva ─────────────────────────────
//
// ⚠️ La pregunta es «aplica a 42 de 52, ¿por qué esos diez no?». Lo delicado
// es quién cuenta como «no la tiene»: un equipo de workgroup NO es una brecha
// (no le aplica) y una lectura fallida tampoco (no es una ausencia).

const paraFoco = {
  summary: {
    devicesReporting: 4,
    withComputerGpos: 2,
    withUserGpos: 0,
    withoutAnyGpos: 1,
    domainJoinedWithoutGpos: 1,
    notDomainJoinedWithoutGpos: 0,
    unknownDomainWithoutGpos: 0,
    domainUnknown: 0,
    distinctGpos: 1,
    withOu: 0,
    domainControllers: 0,
  },
  gpos: [{ name: "ADC-SecurityFix", computer: 2, user: 0, devices: 2 }],
  devices: [
    { agentId: "a-1", hostname: "CON-1", osFullVersion: "Win11", computerGpos: ["ADC-SecurityFix"], userGpos: [], partOfDomain: true, domain: "d", domainRole: null, ou: null, ouSegments: [], ouReported: false, collectedAt: "2026-09-22T20:00:00.000Z" },
    { agentId: "a-2", hostname: "CON-2", osFullVersion: "Win11", computerGpos: ["ADC-SecurityFix"], userGpos: [], partOfDomain: true, domain: "d", domainRole: null, ou: null, ouSegments: [], ouReported: false, collectedAt: "2026-09-22T20:00:00.000Z" },
    { agentId: "a-3", hostname: "SIN-ELLA", osFullVersion: "Win11", computerGpos: ["Default Domain Policy"], userGpos: [], partOfDomain: true, domain: "d", domainRole: null, ou: null, ouSegments: [], ouReported: false, collectedAt: "2026-09-22T20:00:00.000Z" },
    { agentId: "a-4", hostname: "WORKGROUP-1", osFullVersion: "Win10", computerGpos: [], userGpos: [], partOfDomain: false, domain: null, domainRole: null, ou: null, ouSegments: [], ouReported: false, collectedAt: "2026-09-22T20:00:00.000Z" },
    { agentId: "a-5", hostname: "NO-LEIDO", osFullVersion: "Win10", computerGpos: null, userGpos: null, partOfDomain: true, domain: "d", domainRole: null, ou: null, ouSegments: [], ouReported: false, collectedAt: "2026-09-22T20:00:00.000Z" },
  ],
};

const unGrupoDeCambio = {
  groups: [
    {
      gpo: "ADC-SecurityFix",
      direction: "added",
      day: "2026-09-22",
      devices: [{ agentId: "a-1", hostname: "CON-1", at: "2026-09-22T20:00:00.000Z" }],
      firstAt: "2026-09-22T20:00:00.000Z",
      lastAt: "2026-09-22T20:00:00.000Z",
    },
  ],
  changes: [],
  windowDays: 30,
  devicesWithSingleReading: 0,
};

describe("WindowsGpos — enfocar una directiva", () => {
  async function enfocar() {
    getWindowsGpoInventory.mockResolvedValue(paraFoco);
    getWindowsGpoChanges.mockResolvedValue(unGrupoDeCambio);
    render(<WindowsGpos />);
    // El nombre sale en dos sitios: la barra del ranking y el historial. Se
    // pincha el del HISTORIAL, que va al final de la página y es el camino
    // que más se usa («esto cambió — ¿a quién más le pasó?»).
    const apariciones = await screen.findAllByText("ADC-SecurityFix");
    fireEvent.click(apariciones[apariciones.length - 1]);
  }

  it("⭐ dice a cuántos equipos del dominio alcanza, que es la pregunta de los diez", async () => {
    await enfocar();
    expect(await screen.findByText(/Applies to 2 of 4 domain devices/i)).toBeInTheDocument();
  });

  it("⭐ y deja ver a los que NO la tienen", async () => {
    await enfocar();
    const boton = await screen.findByRole("button", { name: /Not applied \(1\)/i });
    fireEvent.click(boton);
    expect(await screen.findByText("SIN-ELLA")).toBeInTheDocument();
    expect(screen.getByText(/a different Organizational Unit, or a security or WMI filter/i)).toBeInTheDocument();
  });

  it("⚠️ un equipo de WORKGROUP no es una brecha: no le aplica", async () => {
    await enfocar();
    fireEvent.click(await screen.findByRole("button", { name: /Not applied/i }));
    expect(screen.queryByText("WORKGROUP-1")).not.toBeInTheDocument();
  });

  it("⚠️ una lectura FALLIDA tampoco: no es una ausencia", async () => {
    await enfocar();
    fireEvent.click(await screen.findByRole("button", { name: /Not applied/i }));
    expect(screen.queryByText("NO-LEIDO")).not.toBeInTheDocument();
    // Y por eso el total de «no la tienen» es 1, no 2.
    expect(screen.getByRole("button", { name: /Not applied \(1\)/i })).toBeInTheDocument();
  });

  it("se puede quitar el foco y volver a la flota entera", async () => {
    await enfocar();
    fireEvent.click(await screen.findByText("Clear"));
    expect(screen.queryByText(/Applies to 2 of 4/i)).not.toBeInTheDocument();
  });
});
