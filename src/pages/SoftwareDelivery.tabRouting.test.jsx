// src/pages/SoftwareDelivery.tabRouting.test.jsx
//
// La pestaña vive en la URL, y un nombre de pestaña que no existe se NOTA.
//
// ⚠️ LOS DOS DEFECTOS QUE ESTO FIJA SON EL MISMO DEFECTO (25-sep), visto desde
// los dos lados:
//
//   · Nadie escribía la pestaña en la URL, así que Atrás salía de la página
//     entera y cinco de las seis pestañas eran inalcanzables por enlace.
//   · Nadie leía la URL, así que `onNavigateTab("distribution")` —una clave que
//     dejó de existir al renombrar la pestaña a `settings`— resolvía con
//     `TAB_INDEX[key] ?? 0` y mandaba al Dashboard. Sin error, sin aviso: el
//     tile «Sites with a DP» era un clic que no hacía nada.
//
// El `??` es el culpable de los dos: convierte «esta pestaña no existe» en
// «vete al principio», que es indistinguible de funcionar.

import { describe, expect, it } from "vitest";

import { tabIndexFor, tabKeyFor } from "./SoftwareDelivery";

describe("tabIndexFor", () => {
  it("resuelve las seis pestañas de la barra", () => {
    expect(
      ["overview", "catalog", "deployments", "install", "uninstall", "settings"].map(tabIndexFor)
    ).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("🔴 un nombre que no existe da null, NO la primera pestaña", () => {
    // Esto es lo único que separa un enlace roto de un clic que no hace nada.
    expect(tabIndexFor("nope")).toBeNull();
    expect(tabIndexFor("")).toBeNull();
    expect(tabIndexFor(undefined)).toBeNull();
  });

  it("⚠️ los nombres viejos siguen llegando y aterrizan donde ahora viven", () => {
    // `distribution` se renombró a `settings` y la franja del Dashboard seguía
    // llamándolo por el nombre viejo; `intake` se retiró y su tarjeta también.
    // Traducirlos es más barato que perseguir cada enlace.
    expect(tabIndexFor("distribution")).toBe(tabIndexFor("settings"));
    expect(tabIndexFor("intake")).toBe(tabIndexFor("catalog"));
  });

  it("⚠️ un alias apunta a una pestaña que EXISTE", () => {
    // Un alias hacia una clave borrada volvería a dar null y habríamos
    // cambiado un enlace roto por otro.
    expect(tabIndexFor("distribution")).not.toBeNull();
    expect(tabIndexFor("intake")).not.toBeNull();
  });
});

describe("tabKeyFor", () => {
  it("es el inverso de tabIndexFor para las pestañas reales", () => {
    // Si estos dos se desalinearan, la URL diría una pestaña y se pintaría
    // otra — y al recargar cambiaría sola.
    for (const key of ["overview", "catalog", "deployments", "install", "uninstall", "settings"]) {
      expect(tabKeyFor(tabIndexFor(key))).toBe(key);
    }
  });

  it("un índice fuera de la barra no inventa nombre", () => {
    expect(tabKeyFor(9)).toBeNull();
  });
});
