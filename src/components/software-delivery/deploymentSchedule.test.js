// src/components/software-delivery/deploymentSchedule.test.js
//
// La hora que elige el operador y la frase que explica la espera.
//
// Las dos se equivocan EN SILENCIO: una conversión mal hecha manda el envío
// seis horas antes, y una frase equivocada le atribuye al operador una espera
// que decidió la política del tenant.

import { describe, expect, it } from "vitest";

import {
  MAX_SCHEDULE_HORIZON_DAYS,
  dispatchSentence,
  parseScheduleInput,
  toLocalInputValue,
  waitingReason,
} from "./deploymentSchedule";

const NOW = new Date("2026-09-20T12:00:00");

describe("parseScheduleInput", () => {
  // ⚠️ EL TEST QUE IMPORTA. El navegador da una hora de pared sin zona; el
  // backend exige un instante con offset porque sin él significaría la hora
  // local del SERVIDOR. Lo que el operador escribe son las 22:00 SUYAS.
  it("⭐ convierte la hora de pared local en un instante con zona", () => {
    const r = parseScheduleInput("2026-09-22T22:00", NOW);
    expect(r.ok).toBe(true);
    expect(r.iso).toBe(new Date("2026-09-22T22:00").toISOString());
    expect(r.iso).toMatch(/Z$/);
    // Y sigue siendo la misma hora de pared al volver.
    expect(toLocalInputValue(new Date(r.iso))).toBe("2026-09-22T22:00");
  });

  it("no acepta un hueco vacío", () => {
    expect(parseScheduleInput("", NOW)).toMatchObject({ ok: false });
    expect(parseScheduleInput(null, NOW)).toMatchObject({ ok: false });
  });

  it("no acepta lo que no es una fecha", () => {
    expect(parseScheduleInput("mañana por la tarde", NOW).ok).toBe(false);
  });

  it("no acepta una hora que ya pasó, y lo dice con la salida a mano", () => {
    const r = parseScheduleInput("2026-09-20T09:00", NOW);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/send now/i);
  });

  it(`no acepta más de ${MAX_SCHEDULE_HORIZON_DAYS} días, porque el paquete va congelado`, () => {
    const inside = new Date(NOW.getTime() + (MAX_SCHEDULE_HORIZON_DAYS * 24 - 1) * 3600_000);
    expect(parseScheduleInput(toLocalInputValue(inside), NOW).ok).toBe(true);

    const outside = new Date(NOW.getTime() + (MAX_SCHEDULE_HORIZON_DAYS * 24 + 2) * 3600_000);
    const r = parseScheduleInput(toLocalInputValue(outside), NOW);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(new RegExp(`${MAX_SCHEDULE_HORIZON_DAYS} days`));
  });
});

describe("toLocalInputValue", () => {
  it("rellena con ceros lo que el input exige", () => {
    expect(toLocalInputValue(new Date(2026, 0, 5, 7, 4))).toBe("2026-01-05T07:04");
  });

  it("una fecha que no lo es no devuelve basura", () => {
    expect(toLocalInputValue("no es una fecha")).toBe("");
  });
});

describe("dispatchSentence", () => {
  const fmt = () => "Sep 22, 26, 22:00";

  it("sin nada que lo retenga, dice que sale ya y que las ventanas no aplican", () => {
    expect(dispatchSentence({ at: null, waitForWindow: false }, fmt)).toMatch(/Dispatches now/);
  });

  it("con hora, dice cuándo", () => {
    expect(dispatchSentence({ at: new Date(), waitForWindow: false }, fmt)).toBe(
      "Goes out at Sep 22, 26, 22:00."
    );
  });

  it("sólo con ventana, la frase de siempre", () => {
    expect(dispatchSentence({ at: null, waitForWindow: true }, fmt)).toMatch(/next maintenance window/);
  });

  // ⚠️ Prometer sólo la hora sería mentir la noche que la ventana esté cerrada,
  // que es exactamente cuando alguien marca las dos cosas.
  it("⭐ con hora Y ventana, avisa de que sale en la más tardía de las dos", () => {
    const s = dispatchSentence({ at: new Date(), waitForWindow: true }, fmt);
    expect(s).toMatch(/Sep 22, 26, 22:00/);
    expect(s).toMatch(/window opens after that/);
  });
});

describe("waitingReason", () => {
  const deployment = (over = {}) => ({ id: 44, status: "running", scheduledAt: null, ...over });
  const formatTime = () => "Sep 18, 26, 22:00";

  it("⭐ un despliegue retenido por la ventana dice POR QUÉ y HASTA CUÁNDO", () => {
    expect(
      waitingReason(
        deployment({ status: "scheduled", scheduledAt: "2026-09-19T03:00:00Z", scheduledReason: "maintenance_window" }),
        formatTime
      )
    ).toBe("Waiting for the maintenance window — dispatches Sep 18, 26, 22:00");
  });

  // ⚠️ La confusión que esta función existe para evitar: decirle «esperando la
  // ventana de mantenimiento» a alguien que eligió esa hora él mismo.
  it("⭐ lo que programó un operador no se le atribuye a la ventana", () => {
    expect(
      waitingReason(
        deployment({ status: "scheduled", scheduledAt: "2026-09-22T04:00:00Z", scheduledReason: "user" }),
        formatTime
      )
    ).toBe("Scheduled — dispatches Sep 18, 26, 22:00");
  });

  // Las filas anteriores a la migración no llevan motivo, y lo que las retenía
  // era siempre la ventana.
  it("sin motivo, se lee como lo que significaba antes", () => {
    expect(waitingReason(deployment({ status: "scheduled", scheduledAt: "2026-09-19T03:00:00Z" }), formatTime))
      .toMatch(/maintenance window/);
  });

  it("retenido sin hora sigue explicando la causa", () => {
    expect(waitingReason(deployment({ status: "scheduled", scheduledAt: null }), formatTime))
      .toBe("Waiting for the maintenance window to open");
    expect(waitingReason(deployment({ status: "scheduled", scheduledAt: null, scheduledReason: "user" }), formatTime))
      .toBe("Scheduled to dispatch later");
  });

  it("lo que se está moviendo no necesita excusa", () => {
    expect(waitingReason(deployment({ status: "running" }), formatTime)).toBeNull();
    expect(waitingReason(deployment({ status: "queued" }), formatTime)).toBeNull();
    expect(waitingReason(undefined, formatTime)).toBeNull();
  });
});
