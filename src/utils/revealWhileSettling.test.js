// src/utils/revealWhileSettling.test.js
//
// La ficha abierta por `?device=` quedaba bajo el pliegue: el scroll se hacía
// con la página aún cargando y las tarjetas de arriba la empujaban después.

import { describe, expect, it } from "vitest";
import { revealWhileSettling } from "./revealWhileSettling";

/** Una ventana de juguete con fotogramas manuales y un elemento que se mueve. */
function setup() {
  const frames = [];
  const listeners = new Map();
  const win = {
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: () => {},
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  let clock = 0;
  // `top` es donde está el elemento en pantalla; scrollIntoView lo trae a 120.
  const el = { top: 0, scrolls: 0 };
  el.getBoundingClientRect = () => ({ top: el.top });
  el.scrollIntoView = () => {
    el.scrolls += 1;
    el.top = 120;
  };
  const runFrame = (advanceMs = 16) => {
    clock += advanceMs;
    const fn = frames.shift();
    fn?.();
  };
  return { win, el, listeners, runFrame, now: () => clock, frames };
}

describe("revealWhileSettling", () => {
  it("🔴 vuelve a colocar el elemento cuando lo de arriba termina de cargar y lo empuja", () => {
    const t = setup();
    t.el.top = 600;
    revealWhileSettling(() => t.el, { win: t.win, now: t.now });

    t.runFrame();
    expect(t.el.scrolls).toBe(1);
    expect(t.el.top).toBe(120);

    // Llegan las tarjetas de arriba: la ficha baja 700 px.
    t.el.top = 820;
    t.runFrame();
    expect(t.el.scrolls).toBe(2);
    expect(t.el.top).toBe(120);

    // Sin movimiento, no se toca.
    t.runFrame();
    expect(t.el.scrolls).toBe(2);
  });

  it("se para en cuanto el operador mueve la vista", () => {
    const t = setup();
    t.el.top = 600;
    revealWhileSettling(() => t.el, { win: t.win, now: t.now });
    t.runFrame();

    t.listeners.get("wheel")();
    t.el.top = 900;
    t.runFrame();
    expect(t.el.scrolls).toBe(1);
    expect(t.listeners.size).toBe(0);
  });

  it("deja de vigilar pasado el plazo", () => {
    const t = setup();
    t.el.top = 600;
    revealWhileSettling(() => t.el, { win: t.win, now: t.now, settleMs: 100 });
    t.runFrame(50);
    t.runFrame(60);
    expect(t.frames).toHaveLength(0);
    expect(t.listeners.size).toBe(0);
  });

  it("espera a que el elemento exista", () => {
    const t = setup();
    let el = null;
    revealWhileSettling(() => el, { win: t.win, now: t.now });
    t.runFrame();
    expect(t.frames).toHaveLength(1);
    el = t.el;
    t.el.top = 500;
    t.runFrame();
    expect(t.el.scrolls).toBe(1);
  });
});
