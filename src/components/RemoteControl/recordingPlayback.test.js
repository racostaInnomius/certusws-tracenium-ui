// Lógica del reproductor de grabaciones (ADR-0012).
//
// El fallo caro aquí no lanza ni pinta en negro: enseña una pantalla PLAUSIBLE
// que nunca existió. Los fotogramas parciales se pintan encima del anterior,
// así que colocarse en un instante sin volver antes al último completo produce
// regiones sueltas sobre restos de otro momento de la sesión — y eso parece
// una captura real.

import { describe, it, expect } from "vitest";
import {
  lastKeyframeAtOrBefore,
  frameIndexAt,
  seekPlan,
  totalDuration,
  integrityNotice
} from "./recordingPlayback";

// f = completo, p = parcial
const F = (t) => ({ t, full: true });
const P = (t) => ({ t, full: false });
const REC = [F(0), P(200), P(400), F(1000), P(1200), P(1400), F(2000), P(2200)];

describe("frameIndexAt", () => {
  it("encuentra el último fotograma en o antes del instante", () => {
    expect(frameIndexAt(REC, 0)).toBe(0);
    expect(frameIndexAt(REC, 500)).toBe(2);
    expect(frameIndexAt(REC, 1000)).toBe(3);
    expect(frameIndexAt(REC, 99999)).toBe(REC.length - 1);
  });

  it("devuelve -1 antes del primero y con lista vacía", () => {
    expect(frameIndexAt(REC, -1)).toBe(-1);
    expect(frameIndexAt([], 100)).toBe(-1);
  });
});

describe("lastKeyframeAtOrBefore", () => {
  it("retrocede hasta el completo anterior", () => {
    expect(lastKeyframeAtOrBefore(REC, 5)).toBe(3);
    expect(lastKeyframeAtOrBefore(REC, 2)).toBe(0);
    expect(lastKeyframeAtOrBefore(REC, 6)).toBe(6);
  });

  it("sin ningún completo devuelve -1, no 0", () => {
    // Devolver 0 fingiría que hay una base sobre la que pintar. No la hay, y
    // el llamador tiene que poder decidir qué enseñar en ese caso.
    expect(lastKeyframeAtOrBefore([P(0), P(100)], 1)).toBe(-1);
  });
});

describe("seekPlan", () => {
  it("avanzando solo pinta lo nuevo", () => {
    // Lo que hace barata la reproducción normal.
    const plan = seekPlan(REC, 2, 1400);
    expect(plan).toEqual({ clear: false, start: 3, end: 5, target: 5 });
  });

  it("SALTAR ATRÁS reconstruye desde el último completo", () => {
    // El test central. Sin esto se verían regiones sueltas sobre restos de
    // otro momento — una pantalla que nunca existió.
    const plan = seekPlan(REC, 7, 1200);
    expect(plan.clear).toBe(true);
    expect(plan.start).toBe(3);   // el completo de t=1000
    expect(plan.end).toBe(4);     // el parcial de t=1200
  });

  it("el primer pintado también arranca en un completo", () => {
    const plan = seekPlan(REC, -1, 1400);
    expect(plan.clear).toBe(true);
    expect(REC[plan.start].full).toBe(true);
  });

  it("saltar a un instante anterior al primer fotograma no pinta nada", () => {
    expect(seekPlan(REC, 3, -50).target).toBe(-1);
  });

  it("una grabación sin completos no se puede pintar", () => {
    // Preferible lienzo vacío a una reconstrucción inventada.
    const plan = seekPlan([P(0), P(100)], -1, 100);
    expect(plan.target).toBe(-1);
    expect(plan.end).toBeLessThan(plan.start);
  });

  it("quedarse en el mismo instante no repinta hacia atrás", () => {
    const plan = seekPlan(REC, 5, 1400);
    expect(plan.clear).toBe(false);
    expect(plan.start).toBeGreaterThan(plan.end); // nada que pintar
  });
});

describe("totalDuration", () => {
  it("es el instante del último fotograma", () => {
    expect(totalDuration(REC)).toBe(2200);
    expect(totalDuration([])).toBe(0);
  });
});

describe("integrityNotice", () => {
  it("avisa cuando el hash no cuadra", () => {
    // Una grabación cuyo contenido no coincide con lo declarado no es prueba.
    expect(integrityNotice({ integrityOk: false })).toMatch(/unverified/i);
  });

  it("avisa cuando la lectura se cortó", () => {
    expect(integrityNotice({ clean: false })).toMatch(/stopped early/i);
  });

  it("avisa cuando el endpoint dejó de grabar antes de tiempo", () => {
    expect(integrityNotice({ truncated: true })).toMatch(/whole session/i);
  });

  it("acumula los tres, porque son hechos distintos", () => {
    const t = integrityNotice({ truncated: true, integrityOk: false, clean: false });
    expect(t).toMatch(/unverified/i);
    expect(t).toMatch(/stopped early/i);
    expect(t).toMatch(/whole session/i);
  });

  it("no dice nada cuando todo está bien", () => {
    // Un aviso permanente enseña a ignorarlo.
    expect(integrityNotice({ truncated: false, integrityOk: true, clean: true })).toBe("");
  });
});
