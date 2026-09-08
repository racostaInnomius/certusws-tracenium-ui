import { describe, expect, it } from "vitest";
import { REPORT_GROUP_LABELS, groupLabel } from "./reportGroups";

describe("groupLabel", () => {
  it("traduce la sigla del plugin al nombre que la página tiene en el menú", () => {
    expect(groupLabel("SCP")).toBe("Security Compliance");
    expect(groupLabel("PMP")).toBe("Patch Management");
    expect(groupLabel("CDP")).toBe("Crypto Discovery");
  });

  it("deja igual los grupos que ya se llaman como su página", () => {
    expect(groupLabel("Audit")).toBe("Audit");
  });

  it("'Global' es Overview: no tiene plugin, y es la página que resume", () => {
    expect(groupLabel("Global")).toBe("Overview");
  });

  it("un grupo desconocido se enseña TAL CUAL, no como 'Other'", () => {
    // Si el backend añade un plugin y aquí falta su rótulo, ver la sigla es
    // feo pero deja el informe encontrable. Mandarlo a "Other" lo escondería
    // entre los demás y nadie se enteraría de que falta una línea en el mapa.
    expect(groupLabel("RCP")).toBe("RCP");
  });

  it("sin grupo cae en 'Other'", () => {
    expect(groupLabel("")).toBe("Other");
    expect(groupLabel(null)).toBe("Other");
    expect(groupLabel(undefined)).toBe("Other");
  });

  it("cubre los cinco grupos que el registro declara hoy", () => {
    // El backend tipa `group` como esta unión exacta
    // (report-registry.ts). Si añade uno y no llega aquí, este test lo dice
    // antes de que un operador vea una sigla en el catálogo.
    expect(Object.keys(REPORT_GROUP_LABELS).sort()).toEqual(
      ["Audit", "CDP", "Global", "PMP", "SCP"]
    );
  });
});
