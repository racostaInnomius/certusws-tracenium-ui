// La geometría de la dona, y el ajuste a la rejilla de píxeles.
//
// ⚠️ ESTE FICHERO EXISTE POR UN DEFECTO QUE SE VE Y NO SE MIDE A OJO.
//
// En la pestaña Printers (2026-09-20) las tres donas de la fila parecían de
// tamaños distintos y con el borde plano. No lo eran: los tres SVG miden
// 128×128 y el arco pintado 118 px en los tres. Lo que cambiaba era DÓNDE
// caían — x = 241,33 / 835,99 / 1430,66 px, porque un Grid de tercios reparte
// un ancho que no es divisible por tres. Con `devicePixelRatio` 2 eso son
// 0,66 / 1,98 / 1,32 píxeles de dispositivo, y un trazo de 22 px reparte su
// borde entre uno o dos píxeles según dónde caiga.

import { describe, it, expect } from "vitest";
import { ringArcs, snapDelta, RING_CIRCUMFERENCE } from "./ringGeometry";

describe("snapDelta", () => {
  it("⭐ los tres casos REALES de la fila de Printers, con dpr 2", () => {
    // El ajuste lleva cada dona al medio píxel de CSS más cercano, que es el
    // píxel entero del dispositivo.
    expect(snapDelta(241.33, 2)).toBeCloseTo(0.17, 2);
    expect(snapDelta(835.99, 2)).toBeCloseTo(0.01, 2);
    expect(snapDelta(1430.66, 2)).toBeCloseTo(-0.16, 2);
    // Y el resultado cae en la rejilla: posición + ajuste, por dpr, es entero.
    for (const x of [241.33, 835.99, 1430.66]) {
      expect(((x + snapDelta(x, 2)) * 2) % 1).toBeCloseTo(0, 6);
    }
  });

  it("una posición que ya está en la rejilla no se mueve", () => {
    expect(snapDelta(240, 2)).toBe(0);
    expect(snapDelta(240.5, 2)).toBe(0);
    expect(snapDelta(240, 1)).toBe(0);
  });

  it("sin pantalla de alta densidad el ajuste es al píxel entero", () => {
    expect(snapDelta(100.4, 1)).toBeCloseTo(-0.4, 6);
    expect(snapDelta(100.6, 1)).toBeCloseTo(0.4, 6);
  });

  it("⚠️ un valor imposible no mueve la dona a ninguna parte", () => {
    // jsdom, o un nodo aún sin colocar, dan NaN o ceros: el ajuste es 0 y el
    // componente se pinta igual que siempre.
    expect(snapDelta(NaN, 2)).toBe(0);
    expect(snapDelta(undefined, 2)).toBe(0);
    expect(snapDelta(10.25, 0)).toBeCloseTo(-0.25, 6);
  });
});

describe("ringArcs", () => {
  it("las rebanadas se reparten la circunferencia y empiezan arriba", () => {
    const arcs = ringArcs([
      { key: "a", value: 3 },
      { key: "b", value: 1 },
    ]);
    expect(arcs[0].len).toBeCloseTo(RING_CIRCUMFERENCE * 0.75, 6);
    expect(arcs[0].rotation).toBe(-90);
    expect(arcs[1].rotation).toBeCloseTo(180, 6);
    expect(arcs[1].end).toBeCloseTo(RING_CIRCUMFERENCE, 6);
  });

  it("⚠️ con total cero no se inventan arcos de longitud NaN", () => {
    const arcs = ringArcs([{ key: "a", value: 0 }]);
    expect(arcs[0].len).toBe(0);
  });
});
