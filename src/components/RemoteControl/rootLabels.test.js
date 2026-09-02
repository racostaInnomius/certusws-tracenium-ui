// Etiquetas de los atajos de raíz en el gestor de ficheros.
//
// El último componente de la ruta basta casi siempre, y falla justo donde más
// molesta: dos raíces de logs en árboles distintos daban dos chips llamados
// "logs" y uno de los dos no llevaba a ninguna parte. Un atajo roto en una
// herramienta de soporte es peor que no ofrecer atajo — el operador no sabe si
// el fallo es suyo, del equipo o del producto.

import { describe, it, expect } from "vitest";
import { rootLabels } from "./FileBrowserPanel";

describe("rootLabels", () => {
  it("usa el nombre corto cuando no hay colisión", () => {
    const m = rootLabels(["C:\\Users", "C:\\ProgramData", "C:\\Program Files"]);
    expect(m.get("C:\\Users")).toBe("Users");
    expect(m.get("C:\\ProgramData")).toBe("ProgramData");
  });

  it("DESAMBIGUA las que colisionan, anteponiendo el padre", () => {
    const m = rootLabels([
      "C:\\ProgramData\\Tracenium\\logs",
      "C:\\ProgramData\\Tracenium\\PrivSvc\\logs",
    ]);
    expect(m.get("C:\\ProgramData\\Tracenium\\logs")).toBe("Tracenium\\logs");
    expect(m.get("C:\\ProgramData\\Tracenium\\PrivSvc\\logs")).toBe("PrivSvc\\logs");
  });

  it("solo alarga las que repiten, no todas", () => {
    // Alargar la fila entera por una colisión la haría ilegible.
    const m = rootLabels(["C:\\Users", "C:\\a\\logs", "C:\\b\\logs"]);
    expect(m.get("C:\\Users")).toBe("Users");
    expect(m.get("C:\\a\\logs")).toBe("a\\logs");
  });

  it("la colisión se detecta sin distinguir mayúsculas", () => {
    // Windows no distingue, así que "Logs" y "logs" son el mismo chip para
    // quien lo mira.
    const m = rootLabels(["C:\\a\\Logs", "C:\\b\\logs"]);
    expect(m.get("C:\\a\\Logs")).toBe("a\\Logs");
    expect(m.get("C:\\b\\logs")).toBe("b\\logs");
  });

  it("aguanta rutas raras sin lanzar", () => {
    expect(() => rootLabels(null)).not.toThrow();
    expect(rootLabels([]).size).toBe(0);
    const m = rootLabels(["/", "C:\\"]);
    expect(m.get("/")).toBeTruthy();
  });

  it("una raíz sin padre no se rompe al desambiguar", () => {
    // "/" y "C:\" no tienen componente anterior; devolver el corto es lo
    // único sensato.
    const m = rootLabels(["/logs", "/logs"]);
    expect(m.get("/logs")).toBe("logs");
  });
});
