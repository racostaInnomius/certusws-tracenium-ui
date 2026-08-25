import { describe, it, expect } from "vitest";
import {
  TIERS,
  usageWarning,
  pluginsIncludedIn,
  pricesFrom,
  availableTiers,
  estimateLine,
  estimateTotal,
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

/**
 * El catálogo tal y como lo devuelve Stripe: importes en céntimos, y el anual
 * NO es doce veces el mensual —lleva descuento—. Esa asimetría es justo por lo
 * que los precios dejaron de estar escritos a mano en el frontend.
 */
const CATALOG = [
  { line: "endpoint", tier: "starter", interval: "monthly", unitAmount: 200, currency: "usd" },
  { line: "endpoint", tier: "professional", interval: "monthly", unitAmount: 600, currency: "usd" },
  { line: "endpoint", tier: "enterprise", interval: "monthly", unitAmount: 1000, currency: "usd" },
  { line: "mdm", tier: "professional", interval: "monthly", unitAmount: 400, currency: "usd" },
  { line: "endpoint", tier: "starter", interval: "yearly", unitAmount: 2000, currency: "usd" },
  { line: "endpoint", tier: "professional", interval: "yearly", unitAmount: 6000, currency: "usd" },
  { line: "mdm", tier: "professional", interval: "yearly", unitAmount: 4000, currency: "usd" },
];

const M = pricesFrom(CATALOG, "monthly");
const Y = pricesFrom(CATALOG, "yearly");

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

describe("catálogo de precios", () => {
  it("separa mensual de anual", () => {
    expect(M.endpoint.starter).toBe(200);
    expect(Y.endpoint.starter).toBe(2000);
  });

  it("sólo ofrece tiers que EXISTEN en esa periodicidad", () => {
    // Enterprise no tiene precio anual en este catálogo. Ofrecerlo sería un
    // botón que falla al pulsarlo: el alta muere resolviendo un lookup_key
    // que no existe en Stripe.
    expect(availableTiers(M, "endpoint")).toEqual(["starter", "professional", "enterprise"]);
    expect(availableTiers(Y, "endpoint")).toEqual(["starter", "professional"]);
  });

  it("con catálogo vacío no ofrece nada", () => {
    expect(availableTiers(pricesFrom([], "monthly"), "endpoint")).toEqual([]);
  });
});

describe("estimación de coste", () => {
  it("multiplica precio por dispositivo, por línea", () => {
    expect(estimateLine(M, "endpoint", "starter", 50)).toBe(10_000);
    expect(estimateLine(M, "endpoint", "enterprise", 12)).toBe(12_000);
  });

  it("el Professional de MDM cuesta distinto que el de endpoints", () => {
    // $4 frente a $6. Un único mapa por tier —sin la línea— daría cifras
    // falsas justo en el plan que más se va a vender de MDM.
    expect(estimateLine(M, "mdm", "professional", 10)).toBe(4_000);
    expect(estimateLine(M, "endpoint", "professional", 10)).toBe(6_000);
  });

  it("suma las dos líneas", () => {
    expect(
      estimateTotal(CATALOG, {
        interval: "monthly",
        endpoint: { tier: "enterprise", quantity: 500 },
        mdm: { tier: "professional", quantity: 30 },
      })
    ).toBe(500 * 1000 + 30 * 400);
  });

  it("un cliente sólo-MDM estima sólo su línea", () => {
    expect(
      estimateTotal(CATALOG, { interval: "monthly", mdm: { tier: "professional", quantity: 30 } })
    ).toBe(12_000);
  });

  it("el anual no es doce veces el mensual", () => {
    // $20/año frente a $2/mes: hay descuento. Es la razón de que los precios
    // vengan de Stripe y no de una tabla copiada a mano.
    const sel = { endpoint: { tier: "starter", quantity: 10 } };
    expect(estimateTotal(CATALOG, { ...sel, interval: "yearly" })).toBe(20_000);
    expect(estimateTotal(CATALOG, { ...sel, interval: "monthly" })).toBe(2_000);
  });

  it("no estima con cantidades inválidas", () => {
    // Mejor no enseñar nada que enseñar un número inventado junto a un campo
    // que el usuario está editando.
    expect(estimateLine(M, "endpoint", "starter", 0)).toBeNull();
    expect(estimateLine(M, "endpoint", "starter", NaN)).toBeNull();
    expect(estimateLine(M, "mdm", "enterprise", 10)).toBeNull(); // MDM no tiene ese tier
    expect(estimateTotal(CATALOG, { interval: "monthly" })).toBeNull();
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

describe("aviso de licencias insuficientes", () => {
  it("no dice nada cuando sobran licencias", () => {
    // El caso normal no debe generar ruido.
    expect(usageWarning(100, 40)).toBeNull();
    expect(usageWarning(40, 40)).toBeNull();
  });

  it("avisa cuando la flota entra sólo por el margen", () => {
    // 42 equipos con 40 licencias: cabe (tope 44) pero sin holgura.
    const w = usageWarning(40, 42);
    expect(w.severity).toBe("warning");
    expect(w.message).toContain("44");
  });

  it("es un ERROR cuando ni con el margen cabe", () => {
    // Esto no es un matiz: con 40 licencias y 60 equipos, 16 se quedan fuera
    // de cobertura y el enrolamiento del siguiente falla.
    const w = usageWarning(40, 60);
    expect(w.severity).toBe("error");
  });

  it("sin dato de uso no inventa un aviso", () => {
    // El contador puede fallar. Callar es mejor que asustar con un número que
    // no tenemos.
    expect(usageWarning(40, null)).toBeNull();
    expect(usageWarning(40, undefined)).toBeNull();
  });
});

describe("clasificación del cambio", () => {
  const actual = { interval: "monthly", endpoint: { tier: "professional", quantity: 20 } };

  it("subir de tier es upgrade aunque el gasto baje", () => {
    // Enterprise×10 = $100 < Professional×20 = $120, pero se lleva PMP y CDP
    // de inmediato. Diferir el cargo le regalaría el tier alto todo el mes.
    expect(classifyChange(CATALOG, actual, { interval: "monthly", endpoint: { tier: "enterprise", quantity: 10 } })).toBe("upgrade");
  });

  it("más licencias en el mismo tier es upgrade", () => {
    expect(classifyChange(CATALOG, actual, { interval: "monthly", endpoint: { tier: "professional", quantity: 40 } })).toBe("upgrade");
  });

  it("bajar de tier conservando licencias es downgrade", () => {
    expect(classifyChange(CATALOG, actual, { interval: "monthly", endpoint: { tier: "starter", quantity: 20 } })).toBe("downgrade");
  });

  it("bajar de tier pero subiendo mucho las licencias es UPGRADE", () => {
    // Professional×20 = $120 → Starter×100 = $200. El tier baja pero el gasto
    // sube: cobrarlo como bajada le regalaría 80 licencias hasta el siguiente
    // ciclo. Por eso la clasificación mira el coste, no la dirección del tier.
    expect(classifyChange(CATALOG, actual, { interval: "monthly", endpoint: { tier: "starter", quantity: 100 } })).toBe("upgrade");
  });

  it("pasar de mensual a anual se cobra YA", () => {
    // No sube el tier ni las licencias, pero la próxima factura pasa de $120 a
    // $1.200: es un cargo inmediato, y clasificarlo como bajada lo diferiría
    // regalando el año. Comparar importes POR PERIODO lo resuelve solo.
    const anual = { ...actual, interval: "yearly" };
    expect(classifyChange(CATALOG, actual, anual)).toBe("upgrade");
  });

  it("sin precios conocidos NO se inventa un cargo", () => {
    // Un catálogo que no cargó no puede ser motivo para cobrar de inmediato:
    // equivocarse hacia ahí sería cobrar de más por un cálculo que no supimos
    // hacer. Sin subida de tier, se difiere.
    expect(
      classifyChange([], actual, {
        interval: "monthly",
        endpoint: { tier: "professional", quantity: 200 },
      })
    ).toBe("downgrade");
  });

  it("sin suscripción previa es alta nueva", () => {
    expect(classifyChange(CATALOG, null, { interval: "monthly", endpoint: { tier: "starter", quantity: 5 } })).toBe("new");
  });

  it("añadir la línea de MDM es upgrade", () => {
    expect(
      classifyChange(CATALOG, actual, { ...actual, mdm: { tier: "professional", quantity: 30 } })
    ).toBe("upgrade");
  });

  it("dar de baja una línea es downgrade", () => {
    const conMdm = { ...actual, mdm: { tier: "professional", quantity: 30 } };
    expect(classifyChange(CATALOG, conMdm, actual)).toBe("downgrade");
  });

  it("con dos líneas manda el coste total, no cada línea por su lado", () => {
    const conMdm = { ...actual, mdm: { tier: "professional", quantity: 30 } };
    // Antes: 20×$6 + 30×$4 = $240.
    // Después: 20×$2 + 60×$4 = $280 → paga más, aunque endpoints baje de tier.
    expect(
      classifyChange(CATALOG, conMdm, {
        interval: "monthly",
        endpoint: { tier: "starter", quantity: 20 },
        mdm: { tier: "professional", quantity: 60 },
      })
    ).toBe("upgrade");

    // Recortar en las dos líneas sin subir ninguna sí es bajada pura.
    // Después: 20×$2 + 5×$4 = $60 < $240, y ningún tier sube.
    expect(
      classifyChange(CATALOG, conMdm, {
        interval: "monthly",
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
