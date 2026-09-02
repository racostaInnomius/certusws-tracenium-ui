// src/utils/locationSiteChecks.test.js
//
// El caso que originó esto es el primer test: las cinco reglas reales de
// "Mountainside IG" del tenant 111, una de ellas con la longitud sin signo.

import { describe, it, expect } from "vitest";
import {
  SAME_SITE_TOLERANCE_KM,
  approxDistanceKm,
  findDivergentSites,
  isRuleDivergent,
} from "./locationSiteChecks";

/** Las cinco reglas tal como estaban en producción el 2026-09-01. */
const mountainside = [
  { id: 1, siteName: "Mountainside IG", cidr: "10.10.17.0/24", lat: 26.17178, lon: -97.97376 },
  { id: 2, siteName: "Mountainside IG", cidr: "10.100.2.0/24", lat: 26.17178, lon: -97.97376 },
  { id: 3, siteName: "Mountainside IG", cidr: "10.100.17.0/24", lat: 26.17178, lon: -97.97376 },
  // ⚠️ Ésta es la mala: le falta el signo menos.
  { id: 4, siteName: "Mountainside IG", cidr: "10.100.19.0/24", lat: 26.17178, lon: 97.97376 },
  { id: 5, siteName: "Mountainside IG", cidr: "10.130.130.0/24", lat: 26.17178, lon: -97.97376 },
];

describe("findDivergentSites — el caso real", () => {
  it("⚠️ detecta el signo que faltaba", () => {
    const [c] = findDivergentSites(mountainside);
    expect(c.siteName).toBe("Mountainside IG");
    // Un signo invertido en la longitud son casi 20 000 km.
    expect(c.maxDistanceKm).toBeGreaterThan(15000);
  });

  it("señala la regla equivocada, no sólo el sitio", () => {
    const [c] = findDivergentSites(mountainside);
    const cidrs = c.farthest.map((r) => r.cidr);
    expect(cidrs).toContain("10.100.19.0/24");
  });

  it("un catálogo corregido no reporta nada", () => {
    const arreglado = mountainside.map((r) =>
      r.id === 4 ? { ...r, lon: -97.97376 } : r
    );
    expect(findDivergentSites(arreglado)).toEqual([]);
  });
});

describe("findDivergentSites — qué NO es un conflicto", () => {
  it("dos sitios distintos en lugares distintos", () => {
    expect(
      findDivergentSites([
        { id: 1, siteName: "CDMX", lat: 19.43, lon: -99.13 },
        { id: 2, siteName: "Monterrey", lat: 25.68, lon: -100.31 },
      ])
    ).toEqual([]);
  });

  it("⚠️ reglas sin coordenadas: poner nombre a una subred es legítimo", () => {
    // Es el uso más común de esta página y no dice nada sobre ubicación.
    expect(
      findDivergentSites([
        { id: 1, siteName: "Planta", cidr: "10.1.0.0/16" },
        { id: 2, siteName: "Planta", cidr: "10.2.0.0/16", lat: 19.4, lon: -99.1 },
      ])
    ).toEqual([]);
  });

  it("edificios del mismo campus a unos cientos de metros", () => {
    // Avisar de esto sería ruido: para quien mira el mapa son la misma sede.
    const casi = [
      { id: 1, siteName: "Campus", lat: 19.4300, lon: -99.1300 },
      { id: 2, siteName: "Campus", lat: 19.4315, lon: -99.1322 },
    ];
    expect(findDivergentSites(casi)).toEqual([]);
    expect(approxDistanceKm(casi[0], casi[1])).toBeLessThan(SAME_SITE_TOLERANCE_KM);
  });

  it("el mismo nombre con distinta capitalización sigue siendo el mismo sitio", () => {
    const c = findDivergentSites([
      { id: 1, siteName: "Oficina CDMX", lat: 19.43, lon: -99.13 },
      { id: 2, siteName: "oficina cdmx", lat: 25.68, lon: -100.31 },
    ]);
    expect(c).toHaveLength(1);
  });

  it("una sola regla no puede contradecirse", () => {
    expect(findDivergentSites([{ id: 1, siteName: "Solo", lat: 19.4, lon: -99.1 }])).toEqual([]);
  });

  it("un catálogo vacío está bien, no roto", () => {
    expect(findDivergentSites([])).toEqual([]);
    expect(findDivergentSites(null)).toEqual([]);
    expect(findDivergentSites(undefined)).toEqual([]);
  });
});

describe("findDivergentSites — orden y tolerancia", () => {
  it("el conflicto más grave va primero", () => {
    const c = findDivergentSites([
      { id: 1, siteName: "A", lat: 19.4, lon: -99.1 },
      { id: 2, siteName: "A", lat: 20.4, lon: -99.1 },
      { id: 3, siteName: "B", lat: 19.4, lon: -99.1 },
      { id: 4, siteName: "B", lat: 50.0, lon: 10.0 },
    ]);
    expect(c.map((x) => x.siteName)).toEqual(["B", "A"]);
  });

  it("la tolerancia es configurable", () => {
    const filas = [
      { id: 1, siteName: "A", lat: 19.40, lon: -99.10 },
      { id: 2, siteName: "A", lat: 19.50, lon: -99.10 },
    ];
    expect(findDivergentSites(filas)).toEqual([]);
    expect(findDivergentSites(filas, 1)).toHaveLength(1);
  });
});

describe("approxDistanceKm", () => {
  it("es null cuando falta una coordenada, no 0", () => {
    // Cero significaría "estan en el mismo sitio", que es lo contrario de
    // "no se puede saber".
    expect(approxDistanceKm({ lat: 1, lon: 2 }, { lat: null, lon: 2 })).toBeNull();
    expect(approxDistanceKm(null, { lat: 1, lon: 2 })).toBeNull();
  });
});

describe("isRuleDivergent", () => {
  it("marca solo las reglas implicadas", () => {
    const c = findDivergentSites(mountainside);
    expect(isRuleDivergent(mountainside[3], c)).toBe(true);
    expect(isRuleDivergent({ id: 99, siteName: "Otro" }, c)).toBe(false);
    expect(isRuleDivergent(null, c)).toBe(false);
    expect(isRuleDivergent(mountainside[3], null)).toBe(false);
  });
});
