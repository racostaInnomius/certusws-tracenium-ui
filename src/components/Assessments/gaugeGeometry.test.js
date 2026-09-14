// src/components/Assessments/gaugeGeometry.test.js

import { describe, expect, it } from "vitest";
import { GAUGE, gaugeArc, gaugePoint } from "./gaugeGeometry";

describe("geometría del gauge", () => {
  it("0 a la izquierda, 50 arriba, 100 a la derecha", () => {
    const close = (p, x, y) => {
      expect(p.x).toBeCloseTo(x, 6);
      expect(p.y).toBeCloseTo(y, 6);
    };
    close(gaugePoint(0), GAUGE.cx - GAUGE.r, GAUGE.cy);
    close(gaugePoint(50), GAUGE.cx, GAUGE.cy - GAUGE.r);
    close(gaugePoint(100), GAUGE.cx + GAUGE.r, GAUGE.cy);
  });

  it("fuera de rango se recorta: un 130 no da la vuelta", () => {
    expect(gaugePoint(130)).toEqual(gaugePoint(100));
    expect(gaugePoint(-5)).toEqual(gaugePoint(0));
  });

  it("el arco va por arriba (sweep 1) y nunca como arco mayor", () => {
    expect(gaugeArc(0, 51)).toMatch(/^M 20\.00 100\.00 A 80 80 0 0 1 /);
  });
});
