import { describe, it, expect } from "vitest";
import { sealedGroupName, sealedGroupDescription } from "../deviceGroupName";

const AHORA = new Date(2026, 8, 8, 14, 32); // 2026-09-08 14:32, hora local

describe("sealedGroupName", () => {
  it("sella el nombre con fecha y número", () => {
    expect(sealedGroupName("Chrome behind", 23, AHORA)).toBe(
      "Chrome behind · 2026-09-08 14:32 · 23 devices"
    );
  });

  it("singular cuando es uno", () => {
    expect(sealedGroupName("Chrome behind", 1, AHORA)).toContain("1 device");
    expect(sealedGroupName("Chrome behind", 1, AHORA)).not.toContain("1 devices");
  });

  it("⚠️ el sello no es decorativo", () => {
    // Un grupo estático nace caducando: Chrome se auto-actualiza y la lista
    // deja de ser cierta. El nombre es lo único que impide que alguien
    // despliegue dentro de un mes sobre una foto de hoy creyendo que está viva.
    const nombre = sealedGroupName("Chrome behind", 23, AHORA);

    expect(nombre).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(nombre).toMatch(/\d{2}:\d{2}/);
  });

  it("sin prefijo utilizable no deja el nombre vacío", () => {
    expect(sealedGroupName("", 5, AHORA)).toBe("Devices · 2026-09-08 14:32 · 5 devices");
    expect(sealedGroupName(null, 5, AHORA)).toContain("Devices");
  });

  it("un conteo imposible no se cuela como texto", () => {
    for (const raw of [null, undefined, NaN, -3, "muchos"]) {
      expect(sealedGroupName("X", raw, AHORA)).toContain("0 devices");
    }
  });

  it("una fecha inválida no rompe el nombre", () => {
    expect(sealedGroupName("Chrome behind", 2, new Date("no soy una fecha"))).toBe(
      "Chrome behind · 2 devices"
    );
  });
});

describe("sealedGroupDescription", () => {
  it("dice de dónde salió y que no se refresca", () => {
    const d = sealedGroupDescription("Chrome · devices behind their platform's newest version", AHORA);

    expect(d).toContain("Chrome");
    expect(d).toContain("2026-09-08 14:32");
    expect(d).toContain("does not refresh");
  });

  it("aguanta sin origen", () => {
    expect(sealedGroupDescription(null, AHORA)).toContain("does not refresh");
  });
});
