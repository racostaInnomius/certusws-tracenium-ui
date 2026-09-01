// src/utils/rankingSubtitle.test.js
//
// Una sola cosa se prueba aquí, y es la que estaba rota en las cinco ventanas
// de ranking del portal: que la frase no prometa más de lo que muestra.

import { describe, it, expect } from "vitest";
import { rankingSubtitle } from "./rankingSubtitle";

describe("rankingSubtitle", () => {
  it("⚠️ dice cuántos faltan cuando la lista está recortada", () => {
    // El caso real: 25 filas de 679 aplicaciones. Antes decía "Complete
    // application ranking by detected installs".
    expect(rankingSubtitle(new Array(25), 679, "applications")).toBe(
      "Showing the top 25 of 679 applications."
    );
  });

  it("sólo afirma completitud cuando de verdad lo está", () => {
    expect(rankingSubtitle(new Array(9), 9, "manufacturers")).toBe(
      "All 9 manufacturers in the fleet."
    );
  });

  it("⚠️ sin un total creíble no afirma nada sobre completitud", () => {
    // Es el caso de un backend viejo que aún no manda la cifra. Decir
    // "todos" ahí sería repetir el defecto que esta función arregla.
    expect(rankingSubtitle(new Array(8), undefined, "publishers")).toBe(
      "Showing 8 publishers."
    );
    expect(rankingSubtitle(new Array(8), 0, "publishers")).toBe("Showing 8 publishers.");
    expect(rankingSubtitle(new Array(8), null, "publishers")).toBe("Showing 8 publishers.");
    expect(rankingSubtitle(new Array(8), "muchos", "publishers")).toBe(
      "Showing 8 publishers."
    );
  });

  it("un total menor que las filas no genera un 'de -3'", () => {
    // No debería pasar, pero si el conteo y las filas se desincronizan la
    // frase tiene que seguir siendo cierta en vez de absurda.
    expect(rankingSubtitle(new Array(10), 7, "sources")).toBe(
      "All 10 sources in the fleet."
    );
  });

  it("aguanta una lista que no es lista", () => {
    expect(rankingSubtitle(null, 5, "devices")).toBe("Showing the top 0 of 5 devices.");
    expect(rankingSubtitle(undefined, undefined, "devices")).toBe("Showing 0 devices.");
  });
});
