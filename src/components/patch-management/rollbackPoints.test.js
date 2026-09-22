// Lo que el panel de puntos de restauración dice de cada snapshot.
//
// Antes un snapshot de un parche fallido vivía para siempre y los de parches de
// SO no se veían en ninguna pantalla. Aquí se fija que cada estado se diga en
// palabras que llevan a la acción correcta, y que ampliar nunca prometa más
// allá del tope.

import { describe, it, expect } from "vitest";
import {
  canExtend,
  canRelease,
  canRevert,
  deadlineText,
  defaultReleaseReason,
  extendChoices,
  humanDuration,
  isPastCap,
  revertWarning,
  stateMeta,
} from "./rollbackPoints";

const H = 3_600_000;
const NOW = Date.parse("2026-09-22T12:00:00Z");
const iso = (h) => new Date(NOW + h * H).toISOString();

const point = (over = {}) => ({
  id: 12,
  hostname: "MSIG-QBOOKS",
  state: "auto_release",
  takenAt: iso(-10),
  deadline: iso(14),
  maxUntil: iso(62),
  maxHoldHours: 72,
  ...over,
});

describe("deadlineText", () => {
  it("lo que se borra solo dice CUÁNDO", () => {
    expect(deadlineText(point(), NOW)).toBe("Removed automatically in 14 h");
  });
  it("⭐ lo retenido pasada su fecha dice CUÁNTO lleva de más", () => {
    expect(deadlineText(point({ state: "needs_decision", deadline: iso(-50) }), NOW)).toBe("Kept 2 days past its date");
  });
  it("lo liberado, que la retirada está en cola", () => {
    expect(deadlineText(point({ state: "released" }), NOW)).toBe("Removal queued");
  });
});

describe("extendChoices", () => {
  it("⭐ +24, +48 y hasta el tope, desde la fecha actual", () => {
    const c = extendChoices(point(), NOW);
    expect(c.map((x) => x.untilIso)).toEqual([iso(38), iso(62)]);
    // +48 desde la fecha (14+48 = 62) coincide con el tope: no se duplica.
    expect(c[1].label).toMatch(/48 more hours/);
  });

  it("⭐ nunca promete más allá del tope, y lo dice", () => {
    const c = extendChoices(point({ deadline: iso(50) }), NOW);
    expect(c.every((x) => Date.parse(x.untilIso) <= Date.parse(iso(62)))).toBe(true);
    expect(c[0].label).toMatch(/capped at the limit/);
  });

  it("si ya pasó su fecha, se amplía desde AHORA, no desde el pasado", () => {
    const c = extendChoices(point({ state: "needs_decision", deadline: iso(-5) }), NOW);
    expect(c[0].untilIso).toBe(iso(24));
  });

  it("en el tope no queda nada que ofrecer", () => {
    expect(extendChoices(point({ deadline: iso(62) }), NOW)).toEqual([]);
    expect(canExtend(point({ deadline: iso(62) }), NOW)).toBe(false);
  });
});

describe("qué acciones caben", () => {
  it("un parche en curso no se libera; lo liberado no se toca", () => {
    expect(canRelease(point({ state: "patch_in_progress" }))).toBe(false);
    expect(canRelease(point({ state: "needs_decision" }))).toBe(true);
    expect(canRelease(point({ state: "released" }))).toBe(false);
    expect(canRevert(point({ state: "released" }))).toBe(false);
    expect(canExtend(point({ state: "released" }), NOW)).toBe(false);
  });
});

describe("avisos", () => {
  it("pasado el tope se marca", () => {
    expect(isPastCap(point({ maxUntil: iso(-1) }), NOW)).toBe(true);
    expect(isPastCap(point(), NOW)).toBe(false);
  });

  it("⭐ revertir dice CUÁNTO trabajo se pierde y propone la vía más segura", () => {
    const w = revertWarning(point({ takenAt: iso(-72) }), NOW);
    expect(w).toMatch(/last 3 days/);
    expect(w).toMatch(/uninstalling the update is usually the safer way back/);
  });

  it("cada estado tiene nombre, y uno desconocido no rompe", () => {
    expect(stateMeta("needs_decision")).toMatchObject({ label: "Needs your decision", tone: "critical" });
    expect(stateMeta("awaiting_reboot").label).toBe("Waiting for restart");
    expect(stateMeta("otra_cosa").label).toBe("otra_cosa");
  });

  it("humanDuration", () => {
    expect(humanDuration(20 * 60 * 1000)).toBe("less than 1 h");
    expect(humanDuration(5 * H)).toBe("5 h");
    expect(humanDuration(-72 * H)).toBe("3 days");
  });
});

describe("defaultReleaseReason", () => {
  it("⚠️ un parche FALLIDO no se propone como «validado»: sería falso en la auditoría", () => {
    expect(defaultReleaseReason("needs_decision")).toBe("accepted_failure");
    expect(defaultReleaseReason("awaiting_reboot")).toBe("not_needed");
    expect(defaultReleaseReason("auto_release")).toBe("validated");
  });
});
