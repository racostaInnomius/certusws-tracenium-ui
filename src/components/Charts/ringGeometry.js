// src/components/Charts/ringGeometry.js
//
// Geometría y constantes de RingCard, fuera del componente para que Fast
// Refresh funcione (un módulo de componentes no debe exportar otra cosa).

import { NEUTRAL } from "../../theme/brand";

// Gris apagado para "pendiente" — distinto a propósito de BRAND.gray, que las
// donas ya usan para su propio "Unknown". Con el mismo gris, "no sabemos su
// SO" y "este equipo aún no reporta" se leerían como la misma rebanada.
export const PENDING_COLOR = NEUTRAL[300];

// RING_SIZE deja RING_RADIUS + RING_STROKE/2 = 59px de radio pintado contra
// un viewBox de 144: 13px de margen por lado (11px con la rebanada activa,
// que engorda el trazo a RING_STROKE + 4). Antes el viewBox medía 128 y ese
// margen era de sólo 5px (3px activo) — bastaba matemáticamente para no
// desbordar, pero al ojo el anillo se veía pegado al borde de la tarjeta por
// los cuatro lados. El anillo en sí no cambia de tamaño, sólo su marco.
export const RING_SIZE = 144;
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

/**
 * Cuánto hay que mover la dona para que caiga en la rejilla de píxeles.
 *
 * ⚠️ POR QUÉ EXISTE, MEDIDO EN LA PESTAÑA PRINTERS (2026-09-20).
 *
 * Las tres cards de una fila salen de un Grid de tercios, y el ancho del
 * contenedor no suele ser divisible por tres: sus donas caían en x = 241,33 /
 * 835,99 / 1430,66. Con `devicePixelRatio` 2 eso son 0,66 / 1,98 / 1,32 píxeles
 * de dispositivo, así que cada anillo se rasterizaba contra una rejilla
 * distinta: un trazo de 22 px reparte su borde entre uno o dos píxeles según
 * dónde caiga, y el resultado es que la MISMA dona se ve más gruesa en una card
 * y con el borde plano en otra. No era un tamaño distinto —los tres SVG miden
 * 128×128 y el arco pintado 118 px en los tres—, era el borde.
 *
 * Devuelve el desplazamiento (en px de CSS) hacia el píxel de dispositivo más
 * cercano. `posicion` tiene que ser la de la dona SIN el ajuste ya aplicado, o
 * el cálculo se persigue a sí mismo en cada pasada.
 */
export function snapDelta(posicion, dpr = 1) {
  const ratio = Number(dpr) > 0 ? Number(dpr) : 1;
  if (!Number.isFinite(posicion)) return 0;
  return Math.round(posicion * ratio) / ratio - posicion;
}

