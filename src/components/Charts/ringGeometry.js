// src/components/Charts/ringGeometry.js
//
// Geometría y constantes de RingCard, fuera del componente para que Fast
// Refresh funcione (un módulo de componentes no debe exportar otra cosa).

import { NEUTRAL } from "../../theme/brand";

// Gris apagado para "pendiente" — distinto a propósito de BRAND.gray, que las
// donas ya usan para su propio "Unknown". Con el mismo gris, "no sabemos su
// SO" y "este equipo aún no reporta" se leerían como la misma rebanada.
export const PENDING_COLOR = NEUTRAL[300];

export const RING_SIZE = 128;
export const RING_RADIUS = 48;
export const RING_STROKE = 22;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Arcos de cada rebanada: longitud sobre la circunferencia y giro de inicio.
 *
 * Se acumula con reduce y no con una variable mutable: el compilador de React
 * prohíbe reasignar durante el render, y con razón — una variable mutada aquí
 * daría arcos distintos en el segundo render con los mismos datos. -90° pone
 * el primero arriba, que es donde el ojo empieza a leer un círculo.
 */
export function ringArcs(slices) {
  const sum = slices.reduce((acc, s) => acc + s.value, 0);
  return slices.reduce((acc, s) => {
    const len = sum > 0 ? (s.value / sum) * RING_CIRCUMFERENCE : 0;
    const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
    return [...acc, { ...s, len, end: start + len, rotation: -90 + (start / RING_CIRCUMFERENCE) * 360 }];
  }, []);
}
