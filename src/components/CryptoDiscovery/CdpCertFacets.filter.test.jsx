// src/components/CryptoDiscovery/CdpCertFacets.filter.test.jsx
//
// Las facetas cuentan lo MISMO que la tabla que tienen al lado.
//
// `facetFilterOf` es una lista blanca de claves: un filtro que no esté
// escrito ahí no llega al backend, y entonces la columna de la izquierda
// cuenta el inventario entero mientras la tabla enseña el subconjunto. No
// falla: MIENTE, que es peor. Pasó el 2026-09-11 con el filtro `catalyst`
// recién añadido — «1–4 of 4» junto a una faceta que decía 116.
//
// Este test deriva las claves de `CDP_URL_KEYS` en vez de repetirlas, así
// que el filtro que alguien añada mañana y olvide propagar aparece aquí
// como fallo y no en la pantalla de un cliente.

import { describe, expect, it } from "vitest";
import { facetFilterOf } from "./CdpCertFacets";
import { CDP_URL_KEYS } from "../../hooks/useCdpFilter";

/**
 * Claves de la URL que NO son filtros del inventario:
 *   tab   — qué pestaña se ve.
 *   view  — agrupación (por certificado / por equipo), no acota el conjunto.
 * Cualquier otra ES un filtro y tiene que viajar a las facetas.
 */
const NO_SON_FILTRO = new Set(["tab", "view"]);

const VALOR_DE_MUESTRA = {
  search: "msig",
  status: "expiring",
  flag: "weak_sig",
  issuer: "Tracenium",
  hasPrivateKey: true,
  hasFlags: true,
  eku: "clientAuth",
  kem: "hybrid",
  catalyst: true,
  includeRoots: true,
  keyAlgorithm: "RSA",
  keySizeBits: 2048,
  family: "quantum_broken",
  source: "store",
  scope: "machine",
  storeName: "LocalMachine\\My",
  agentId: "a-1",
  notAfterFrom: "2026-01-01",
  notAfterTo: "2026-12-31"
};

describe("facetFilterOf: la barra lateral cuenta como la tabla", () => {
  it("⭐ propaga TODOS los filtros de la URL, no una lista blanca que se queda corta", () => {
    const filtroCompleto = {};
    for (const name of Object.keys(CDP_URL_KEYS)) {
      if (NO_SON_FILTRO.has(name)) continue;
      expect(VALOR_DE_MUESTRA, `falta un valor de muestra para «${name}»`).toHaveProperty(name);
      filtroCompleto[name] = VALOR_DE_MUESTRA[name];
    }

    const enviado = facetFilterOf(filtroCompleto);

    const olvidados = Object.keys(filtroCompleto).filter((k) => enviado[k] === undefined);
    expect(olvidados, "estos filtros no llegan a las facetas: contarían de más").toEqual([]);
  });

  it("⭐ el catalyst arrastra la lente, igual que la lista", () => {
    expect(facetFilterOf({ catalyst: true })).toEqual(
      expect.objectContaining({ catalyst: true, certClass: "all", includeRoots: true, lens: "list" })
    );
  });

  it("sin catalyst no se abre la lente sola", () => {
    const out = facetFilterOf({ search: "x" });
    expect(out.catalyst).toBeUndefined();
    expect(out.certClass).toBeUndefined();
  });

  it("pide siempre la lente de la lista: el mismo constructor que /certificates", () => {
    expect(facetFilterOf({}).lens).toBe("list");
  });

  it("un filtro vacío o en false no viaja (no acota nada y ensucia la consulta)", () => {
    const out = facetFilterOf({ search: "", flag: null, hasFlags: false, catalyst: false });
    expect(Object.keys(out)).toEqual(["lens"]);
  });
});
