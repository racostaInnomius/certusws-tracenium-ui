// src/components/Overview/signalCoverageModel.test.js
//
// "Blind spots" repartido por los bloques del Overview. Lo que se fija aquí
// es lo que separa una cifra útil de una alarma que se aprende a ignorar:
//
//   · "nunca reportó" y "lleva semanas callado" se dicen por separado;
//   · cada bloque pinta SÓLO las señales de sus plugins, y sólo si el plan
//     las incluye (lo no contratado no es un hueco);
//   · el titular sale del backend deduplicado, no de sumar las señales.

import { describe, expect, it } from "vitest";
import { barColor, entitledSignal, gapText, headline } from "./signalCoverageModel";

const signal = (over = {}) => ({
  key: "compliance",
  label: "Compliance posture",
  plugin: "scp",
  entitled: true,
  staleAfterDays: 3,
  reporting: 40,
  stale: 5,
  never: 37,
  blind: 42,
  blindPct: 51.2,
  ...over,
});

const COVERAGE = {
  fleet: 68,
  devicesWithAnyGap: 20,
  signals: [
    signal({ key: "inventory", label: "Hardware & OS inventory", plugin: "amp" }),
    signal({ key: "compliance", plugin: "scp" }),
    signal({ key: "patches", label: "Missing patches", plugin: "pmp", entitled: false }),
    signal({ key: "certificates", label: "Certificates", plugin: "cdp" }),
  ],
};

describe("el texto del hueco", () => {
  it("separa lo que nunca reportó de lo que lleva demasiado callado", () => {
    expect(gapText(signal())).toBe("37 never reported · 5 silent for over 3 days");
    expect(gapText(signal({ never: 0, blind: 5 }))).toBe("5 silent for over 3 days");
    expect(gapText(signal({ stale: 0, blind: 37 }))).toBe("37 never reported");
  });

  it("todo reportando se dice, en vez de dejar el hueco en blanco", () => {
    expect(gapText(signal({ blind: 0, never: 0, stale: 0 }))).toMatch(/every device is reporting/i);
  });
});

describe("el color", () => {
  it("verde sólo cuando no hay ceguera; sin plan no se pinta de éxito", () => {
    expect(barColor(signal({ blind: 0, blindPct: 0 }))).toBe("success");
    expect(barColor(signal({ blindPct: 3 }))).toBe("warning");
    expect(barColor(signal({ blindPct: 51.2 }))).toBe("error");
    expect(barColor(signal({ entitled: false, blindPct: 0 }))).not.toBe("success");
  });
});

describe("entitledSignal — cada bloque pide SUS señales por clave", () => {
  it("devuelve la señal concedida por clave", () => {
    expect(entitledSignal(COVERAGE, "compliance")?.plugin).toBe("scp");
    expect(entitledSignal(COVERAGE, "certificates")?.plugin).toBe("cdp");
  });

  it("⚠️ una señal fuera del plan no es un hueco: null", () => {
    expect(entitledSignal(COVERAGE, "patches")).toBeNull();
  });

  it("sin respuesta (403 sin assets_view, o fallo) o sin parque, no hay nada", () => {
    expect(entitledSignal(null, "inventory")).toBeNull();
    expect(entitledSignal({ ...COVERAGE, fleet: 0 }, "inventory")).toBeNull();
  });
});

describe("el titular de la cabecera", () => {
  it("⭐ equipos con algún hueco, sobre el parque, tal cual los da el backend (no sumados)", () => {
    expect(headline(COVERAGE)).toEqual({ tone: "warning", text: "20 of 68 devices are missing at least one signal" });
  });

  it("sin huecos lo dice en neutro; sin parque o sin datos no dice nada", () => {
    expect(headline({ ...COVERAGE, devicesWithAnyGap: 0 })).toEqual({
      tone: "ok",
      text: "All 68 devices report every signal in your plan",
    });
    expect(headline({ fleet: 0, devicesWithAnyGap: 0, signals: [] })).toBeNull();
    expect(headline(null)).toBeNull();
  });
});
