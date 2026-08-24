import { describe, it, expect } from "vitest";
import {
  TIERS,
  pluginsIncludedIn,
  estimateMonthly,
  classifyChange,
  graceCeiling,
  statusNotice,
} from "./billingModel";

/**
 * Las reglas que el usuario va a comparar contra su factura.
 *
 * Se prueban sin React a propósito: si un cambio de maquetación pudiera romper
 * el cálculo del margen de licencias o el aviso de impago, nadie lo notaría
 * hasta que un cliente se quedara sin enrolar equipos.
 */

const DAY = 86_400_000;
const NOW = new Date("2026-08-21T12:00:00Z");

describe("planes aditivos", () => {
  it("cada nivel acumula los de abajo", () => {
    expect(pluginsIncludedIn("starter").sort()).toEqual(["amp", "sdp"]);
    expect(pluginsIncludedIn("professional").sort()).toEqual(
      ["amp", "rcp", "scp", "sdp"]
    );
    expect(pluginsIncludedIn("enterprise")).toHaveLength(6);
  });

  it("subir de plan nunca quita nada", () => {
    // Es la propiedad que hace honesto presentar los planes como "+2 plugins".
    for (let i = 1; i < TIERS.length; i++) {
      const menor = new Set(pluginsIncludedIn(TIERS[i - 1]));
      const mayor = new Set(pluginsIncludedIn(TIERS[i]));
      for (const p of menor) expect(mayor.has(p)).toBe(true);
    }
  });
});

describe("estimación de coste", () => {
  it("multiplica precio por dispositivo", () => {
    expect(estimateMonthly("starter", 50)).toBe(100);
    expect(estimateMonthly("enterprise", 12)).toBe(120);
  });

  it("no estima con cantidades inválidas", () => {
    // Mejor no enseñar nada que enseñar un número inventado junto a un campo
    // que el usuario está editando.
    expect(estimateMonthly("starter", 0)).toBeNull();
    expect(estimateMonthly("starter", NaN)).toBeNull();
    expect(estimateMonthly("nope", 10)).toBeNull();
  });
});

describe("margen de enrolamiento", () => {
  it("es el tope contratado más un 10%, redondeando hacia arriba", () => {
    // Tiene que coincidir EXACTO con el backend (ADR-0005): si la pantalla
    // prometiera un margen distinto al que aplica el enrolamiento, el usuario
    // descubriría la diferencia intentando dar de alta un equipo.
    expect(graceCeiling(50)).toBe(55);
    expect(graceCeiling(5)).toBe(6);
    expect(graceCeiling(1)).toBe(2);
    expect(graceCeiling(0)).toBe(0);
  });
});

describe("clasificación del cambio", () => {
  const actual = { tier: "professional", quantity: 20 };

  it("subir de tier es upgrade aunque bajen las licencias", () => {
    expect(classifyChange(actual, { tier: "enterprise", quantity: 10 })).toBe("upgrade");
  });

  it("más licencias en el mismo tier es upgrade", () => {
    expect(classifyChange(actual, { tier: "professional", quantity: 40 })).toBe("upgrade");
  });

  it("bajar de tier es downgrade", () => {
    expect(classifyChange(actual, { tier: "starter", quantity: 100 })).toBe("downgrade");
  });

  it("sin suscripción previa es alta nueva", () => {
    expect(classifyChange(null, { tier: "starter", quantity: 5 })).toBe("new");
  });
});

describe("avisos de estado", () => {
  it("cuenta los días de gracia que quedan en un impago", () => {
    const n = statusNotice(
      { status: "past_due", pastDueSince: new Date(NOW - 3 * DAY).toISOString() },
      NOW
    );
    expect(n.severity).toBe("warning");
    expect(n.message).toContain("12 días");
  });

  it("pasa a error cuando la gracia se agotó", () => {
    const n = statusNotice(
      { status: "past_due", pastDueSince: new Date(NOW - 20 * DAY).toISOString() },
      NOW
    );
    expect(n.severity).toBe("error");
    expect(n.message).toContain("suspendida");
  });

  it("durante el trial dice a qué plan se caerá", () => {
    // El trial abre todo; el usuario tiene que saber qué conserva al vencer, o
    // el apagado le parecerá una avería.
    const n = statusNotice(
      {
        status: "trialing",
        inTrial: true,
        tier: "starter",
        trialEndsAt: new Date(NOW.getTime() + 10 * DAY).toISOString(),
      },
      NOW
    );
    expect(n.severity).toBe("info");
    expect(n.message).toContain("Starter");
  });

  it("una suscripción al día no genera ruido", () => {
    expect(statusNotice({ status: "active", tier: "professional" }, NOW)).toBeNull();
  });
});
