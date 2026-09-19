// El segundo chart de «Start here»: parches pendientes por severidad.
//
// Lo que se fija aquí es lo que el operador puede creerse mirándolo: que la
// unidad son parches y no equipos, que un 0 en critical se dice en voz alta, y
// que una banda con valor nunca se pinta como si estuviera vacía.

import { describe, it, expect } from "vitest";
import { missingBySeverityData, SEVERITY_BANDS } from "./missingBySeverity";

/** T111 el 18-sep: 9 equipos con actualizaciones, muchos más parches detrás. */
const T111 = { critical: 37, important: 121, moderate: 44, low: 12, unknown: 0 };

describe("missingBySeverityData", () => {
  it("suma el total y reparte los porcentajes sobre él", () => {
    const d = missingBySeverityData(T111);
    expect(d.total).toBe(214);
    const critical = d.bands.find((b) => b.key === "critical");
    expect(critical.value).toBe(37);
    expect(Math.round(critical.pct)).toBe(17);
    // Los porcentajes de las bandas con valor suman el 100% del total.
    const sum = d.bands.reduce((s, b) => s + b.pct, 0);
    expect(Math.round(sum)).toBe(100);
  });

  it("⭐ «critical + important» se calcula sobre parches, no sobre equipos", () => {
    // 158 de 214 son lo que urge. Es el dato que acompaña al chart y la razón
    // de que este panel no repita el donut: allí serían 9 equipos.
    const d = missingBySeverityData(T111);
    expect(d.urgent).toBe(158);
    expect(d.topShare).toBe(73);
  });

  it("redondea el porcentaje hacia abajo: con 99,6% no se dice 100%", () => {
    const d = missingBySeverityData({ critical: 249, important: 0, low: 1 });
    expect(d.topShare).toBe(99);
  });

  it("⭐ un 0 en critical se dice; un 0 en moderate no ocupa sitio", () => {
    const d = missingBySeverityData({ critical: 0, important: 4, moderate: 0, low: 0 });
    const keys = d.bands.map((b) => b.key);
    expect(keys).toContain("critical");
    expect(keys).toContain("important");
    expect(keys).not.toContain("moderate");
    expect(keys).not.toContain("low");
  });

  it("una severidad que el agente no manda cae en «Unspecified» y se ve", () => {
    const d = missingBySeverityData({ critical: 1, unknown: 9 });
    expect(d.bands.find((b) => b.key === "unknown")).toMatchObject({ value: 9, label: "Unspecified" });
  });

  it("sin datos no inventa un total ni divide por cero", () => {
    for (const input of [undefined, null, {}, "nope", 7]) {
      const d = missingBySeverityData(input);
      expect(d.total).toBe(0);
      expect(d.topShare).toBe(0);
      expect(d.bands.every((b) => b.pct === 0)).toBe(true);
    }
  });

  it("el orden de lectura es el de urgencia", () => {
    expect(SEVERITY_BANDS.map((b) => b.key)).toEqual([
      "critical",
      "important",
      "moderate",
      "low",
      "unknown",
    ]);
    const d = missingBySeverityData(T111);
    expect(d.bands.map((b) => b.key)).toEqual(["critical", "important", "moderate", "low"]);
  });

  it("critical no comparte tono con important: el color no es la única señal", () => {
    // El relleno crítico es el mismo `errorText` que el donut, por la misma
    // razón de contraste; lo que se fija aquí es que no colisionen.
    const tones = Object.fromEntries(SEVERITY_BANDS.map((b) => [b.key, b.tone]));
    expect(tones.critical).toBe("critical");
    expect(tones.important).toBe("caution");
    expect(tones.critical).not.toBe(tones.important);
  });
});
