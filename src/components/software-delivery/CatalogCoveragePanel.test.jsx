// src/components/software-delivery/CatalogCoveragePanel.test.jsx
//
// El bloque que contesta «¿cómo está el parque frente a lo que publiqué?».
//
// Lo que se fija aquí son las DECISIONES DE LECTURA, que son las que pueden
// mentir sin dar error: el denominador de la barra, que «sin instalar» no se
// cuele como si fuera una versión instalada, y que un panel que no carga lo
// diga en vez de desaparecer.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CatalogCoveragePanel, {
  catalogLagsFleet,
  coverageSegments,
  versionSummary,
} from "./CatalogCoveragePanel";

afterEach(cleanup);

/** La forma real de Chrome en T111: 30 de 56, casi todos auto-actualizados. */
const chrome = {
  packageId: 9,
  name: "Google Chrome",
  catalogVersion: "152.0.7977.83",
  installedDevices: 30,
  missingDevices: 26,
  current: 2,
  ahead: 25,
  behind: 3,
  unknown: 0,
  versions: [
    { version: "153.0.8010.48", devices: 11, state: "ahead" },
    { version: "153.0.8010.50", devices: 9, state: "ahead" },
    { version: "152.0.7977.83", devices: 2, state: "current" },
  ],
};

describe("coverageSegments", () => {
  it("⭐ el denominador es la FLOTA, no lo instalado", () => {
    // Con el instalado como denominador, un título que tiene 30 de 56 pintaría
    // la barra llena y la fila diría lo contrario de lo que pasa.
    const segs = coverageSegments(chrome, 56);
    const total = segs.reduce((n, s) => n + s.pct, 0);
    expect(Math.round(total)).toBe(100);
    expect(Math.round(segs.find((s) => s.key === "missing").pct)).toBe(46);
  });

  it("el hueco «sin instalar» va al final y sin color de estado", () => {
    const segs = coverageSegments(chrome, 56);
    expect(segs[segs.length - 1]).toMatchObject({ key: "missing", devices: 26, color: null });
  });

  it("los estados a cero no ocupan sitio", () => {
    const segs = coverageSegments(chrome, 56);
    expect(segs.map((s) => s.key)).toEqual(["current", "ahead", "behind", "missing"]);
    expect(segs.some((s) => s.devices === 0)).toBe(false);
  });

  it("sin flota no hay barra que dibujar", () => {
    expect(coverageSegments(chrome, 0)).toEqual([]);
  });
});

describe("versionSummary y catalogLagsFleet", () => {
  it("cuenta la dispersión y nombra la versión más extendida", () => {
    expect(versionSummary(chrome)).toBe("3 versions in the fleet · most common 153.0.8010.48 (11)");
  });

  it("un título que nadie tiene no inventa un resumen", () => {
    expect(versionSummary({ versions: [] })).toBeNull();
  });

  it("⚠️ avisa cuando NADIE está en la versión publicada", () => {
    // Es el caso de Firefox en T111: el único equipo va por delante. La
    // noticia no es el equipo, es que el paquete del catálogo está viejo.
    expect(catalogLagsFleet({ installedDevices: 1, current: 0, behind: 0, ahead: 1 })).toBe(true);
    expect(catalogLagsFleet(chrome)).toBe(false);
    expect(catalogLagsFleet({ installedDevices: 0, current: 0, behind: 0, ahead: 0 })).toBe(false);
  });
});

describe("CatalogCoveragePanel", () => {
  const coverage = { totalDevices: 56, items: [chrome], truncated: false };

  it("⭐ enseña cobertura, hueco y deriva de versiones", async () => {
    render(<CatalogCoveragePanel coverage={coverage} />);

    expect(await screen.findByText("30/56")).toBeInTheDocument();
    expect(screen.getByText("26 without it")).toBeInTheDocument();
    expect(screen.getByText(/3 versions in the fleet/)).toBeInTheDocument();
    expect(screen.getByText("56 devices reporting inventory")).toBeInTheDocument();
  });

  it("⚠️ si la llamada falla lo DICE, no desaparece", async () => {
    // El panel de LAN ya se esfumó en producción y la página decía exactamente
    // lo mismo que si el tenant no usara el DP.
    render(<CatalogCoveragePanel failed coverage={null} />);
    expect(await screen.findByText(/Couldn’t load catalog coverage/)).toBeInTheDocument();
  });

  it("sin equipos reportando no finge una cobertura del 0%", async () => {
    render(<CatalogCoveragePanel coverage={{ totalDevices: 0, items: [chrome] }} />);
    expect(await screen.findByText(/No device has reported a software inventory/)).toBeInTheDocument();
    expect(screen.queryByText("30/56")).toBeNull();
  });

  it("con el catálogo vacío lo dice sin ruido", async () => {
    render(<CatalogCoveragePanel coverage={{ totalDevices: 56, items: [] }} />);
    expect(await screen.findByText(/No deployable packages/)).toBeInTheDocument();
  });

  it("un recuento truncado se declara", async () => {
    render(<CatalogCoveragePanel coverage={{ ...coverage, truncated: true }} />);
    expect(await screen.findByText(/these counts are a floor/)).toBeInTheDocument();
  });

  it("la fila navega al catálogo, y es alcanzable con el teclado", async () => {
    const onNavigateTab = vi.fn();
    render(<CatalogCoveragePanel coverage={coverage} onNavigateTab={onNavigateTab} />);

    const row = await screen.findByRole("button", {
      name: /Google Chrome: installed on 30 of 56 devices/i,
    });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onNavigateTab).toHaveBeenCalledWith("catalog");
  });
});
