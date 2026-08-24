import { describe, it, expect } from "vitest";
import {
  TIERS,
  pluginsIncludedIn,
  estimateLine,
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
  it("multiplica precio por dispositivo, por línea", () => {
    expect(estimateLine("endpoint", "starter", 50)).toBe(100);
    expect(estimateLine("endpoint", "enterprise", 12)).toBe(120);
  });

  it("el Professional de MDM cuesta distinto que el de endpoints", () => {
    // $4 frente a $6. Un único mapa por tier —sin la línea— daría cifras
    // falsas justo en el plan que más se va a vender de MDM.
    expect(estimateLine("mdm", "professional", 10)).toBe(40);
    expect(estimateLine("endpoint", "professional", 10)).toBe(60);
  });

  it("suma las dos líneas", () => {
    expect(
      estimateMonthly({
        endpoint: { tier: "enterprise", quantity: 500 },
        mdm: { tier: "professional", quantity: 30 },
      })
    ).toBe(500 * 10 + 30 * 4);
  });

  it("un cliente sólo-MDM estima sólo su línea", () => {
    expect(estimateMonthly({ mdm: { tier: "professional", quantity: 30 } })).toBe(120);
  });

  it("no estima con cantidades inválidas", () => {
    // Mejor no enseñar nada que enseñar un número inventado junto a un campo
    // que el usuario está editando.
    expect(estimateLine("endpoint", "starter", 0)).toBeNull();
    expect(estimateLine("endpoint", "starter", NaN)).toBeNull();
    expect(estimateLine("mdm", "enterprise", 10)).toBeNull(); // MDM no tiene ese tier
    expect(estimateMonthly({})).toBeNull();
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
  const actual = { endpoint: { tier: "professional", quantity: 20 } };

  it("subir de tier es upgrade aunque el gasto baje", () => {
    // Enterprise×10 = $100 < Professional×20 = $120, pero se lleva PMP y CDP
    // de inmediato. Diferir el cargo le regalaría el tier alto todo el mes.
    expect(classifyChange(actual, { endpoint: { tier: "enterprise", quantity: 10 } })).toBe("upgrade");
  });

  it("más licencias en el mismo tier es upgrade", () => {
    expect(classifyChange(actual, { endpoint: { tier: "professional", quantity: 40 } })).toBe("upgrade");
  });

  it("bajar de tier conservando licencias es downgrade", () => {
    expect(classifyChange(actual, { endpoint: { tier: "starter", quantity: 20 } })).toBe("downgrade");
  });

  it("bajar de tier pero subiendo mucho las licencias es UPGRADE", () => {
    // Professional×20 = $120 → Starter×100 = $200. El tier baja pero el gasto
    // sube: cobrarlo como bajada le regalaría 80 licencias hasta el siguiente
    // ciclo. Por eso la clasificación mira el coste, no la dirección del tier.
    expect(classifyChange(actual, { endpoint: { tier: "starter", quantity: 100 } })).toBe("upgrade");
  });

  it("sin suscripción previa es alta nueva", () => {
    expect(classifyChange(null, { endpoint: { tier: "starter", quantity: 5 } })).toBe("new");
  });

  it("añadir la línea de MDM es upgrade", () => {
    expect(
      classifyChange(actual, { ...actual, mdm: { tier: "professional", quantity: 30 } })
    ).toBe("upgrade");
  });

  it("dar de baja una línea es downgrade", () => {
    const conMdm = { ...actual, mdm: { tier: "professional", quantity: 30 } };
    expect(classifyChange(conMdm, actual)).toBe("downgrade");
  });

  it("con dos líneas manda el coste total, no cada línea por su lado", () => {
    const conMdm = { ...actual, mdm: { tier: "professional", quantity: 30 } };
    // Antes: 20×$6 + 30×$4 = $240.
    // Después: 20×$2 + 60×$4 = $280 → paga más, aunque endpoints baje de tier.
    expect(
      classifyChange(conMdm, {
        endpoint: { tier: "starter", quantity: 20 },
        mdm: { tier: "professional", quantity: 60 },
      })
    ).toBe("upgrade");

    // Recortar en las dos líneas sin subir ninguna sí es bajada pura.
    // Después: 20×$2 + 5×$4 = $60 < $240, y ningún tier sube.
    expect(
      classifyChange(conMdm, {
        endpoint: { tier: "starter", quantity: 20 },
        mdm: { tier: "professional", quantity: 5 },
      })
    ).toBe("downgrade");
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
