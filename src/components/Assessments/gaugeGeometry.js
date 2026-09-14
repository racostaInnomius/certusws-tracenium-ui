// src/components/Assessments/gaugeGeometry.js
//
// Geometría del gauge de media luna (ScoreGauge): puro, para probar los arcos
// sin montar el SVG.

export const GAUGE = Object.freeze({ cx: 100, cy: 100, r: 80, stroke: 16 });

export function clampScore(v) {
  return Math.max(0, Math.min(100, Number(v)));
}

/** Punto del arco para un valor 0-100: 0 a la izquierda, 100 a la derecha, 50 arriba. */
export function gaugePoint(value, radius = GAUGE.r) {
  const theta = Math.PI * (1 - clampScore(value) / 100);
  return { x: GAUGE.cx + radius * Math.cos(theta), y: GAUGE.cy - radius * Math.sin(theta) };
}

/** Trazo SVG del arco entre dos valores (from < to), por arriba. */
export function gaugeArc(from, to, radius = GAUGE.r) {
  const a = gaugePoint(from, radius);
  const b = gaugePoint(to, radius);
  const f = (n) => n.toFixed(2);
  return `M ${f(a.x)} ${f(a.y)} A ${radius} ${radius} 0 0 1 ${f(b.x)} ${f(b.y)}`;
}
