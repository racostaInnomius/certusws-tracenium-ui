// La máscara del barrido de entrada no puede recortar el anillo.
//
// ⚠️ EL "CORTADO" QUE SOBREVIVIÓ A DOS ARREGLOS (Printers, 2026-09-24).
//
// Las donas salían con el borde plano arriba, abajo y a los lados. Se agrandó
// el viewBox (128 → 144) y se ajustó a la rejilla de píxeles, y seguían igual,
// porque no recortaba ninguno de los dos: recortaba la MÁSCARA. Sin maskUnits,
// su región es el 120% de la caja del <g> enmascarado, y SVG mide esa caja sin
// el trazo — círculo de radio 48 → caja de 96 → región de ±57,6 px, contra un
// anillo pintado hasta 59 px (61 con la rebanada activa).

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RingCard from "./RingCard";
import { RING_RADIUS, RING_SIZE, RING_STROKE } from "./ringGeometry";

const SLICES = [
  { key: "hp", label: "HP", value: 3, color: "#4a8f88" },
  { key: "epson", label: "Epson", value: 2, color: "#6cc3b0" },
];

describe("RingCard · máscara", () => {
  it("⭐ la región de la máscara cubre el anillo entero, también con la rebanada activa", () => {
    const { container } = render(<RingCard title="By vendor" slices={SLICES} activeKey="hp" />);
    const mask = container.querySelector("mask");

    // En el marco del SVG, no en el de la caja del grupo.
    expect(mask.getAttribute("maskUnits")).toBe("userSpaceOnUse");

    const x = Number(mask.getAttribute("x"));
    const y = Number(mask.getAttribute("y"));
    const w = Number(mask.getAttribute("width"));
    const h = Number(mask.getAttribute("height"));
    const centro = RING_SIZE / 2;
    const exterior = RING_RADIUS + (RING_STROKE + 4) / 2;
    expect(x).toBeLessThanOrEqual(centro - exterior);
    expect(y).toBeLessThanOrEqual(centro - exterior);
    expect(x + w).toBeGreaterThanOrEqual(centro + exterior);
    expect(y + h).toBeGreaterThanOrEqual(centro + exterior);
  });
});
