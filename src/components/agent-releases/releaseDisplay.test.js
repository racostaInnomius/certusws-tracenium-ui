import { describe, expect, it } from "vitest";
import { displayVersion } from "./releaseDisplay";

// La página de descargas decía «latest» y enseñaba la fecha de alta de la fila
// del catálogo: no se veía qué versión se instala ni cuándo se publicó.
describe("displayVersion", () => {
  it("una fila latest enseña la versión a la que resuelve hoy", () => {
    expect(displayVersion({ version: "latest", publishedVersion: "1.1.78" })).toBe("1.1.78");
  });

  it("sin build publicado se queda en latest", () => {
    expect(displayVersion({ version: "latest", publishedVersion: null })).toBe("latest");
  });

  it("una fila con versión fija no cambia", () => {
    expect(displayVersion({ version: "1.1.70", publishedVersion: "1.1.70" })).toBe("1.1.70");
  });
});
