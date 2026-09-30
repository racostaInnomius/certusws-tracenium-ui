import { describe, it, expect } from "vitest";
import {
  addonOffer,
  addonsTotal,
  withAddons,
  PACKAGE_TIERS,
  PAST_DUE_GRACE_DAYS,
  usageWarning,
  pluginsIncludedIn,
  pricesFrom,
  availableTiers,
  estimateLine,
  estimateTotal,
  classifyChange,
  graceCeiling,
  statusNotice,
  contractedSelection,
  initialSelection,
  planStatus,
  chargeTiming,
  pluginState,
  yearlySavingsLabel,
  invoiceStatus,
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
  { line: "endpoint", tier: "business", interval: "monthly", unitAmount: 1000, currency: "usd" },
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
    expect(pluginsIncludedIn("business").sort()).toEqual(["amp", "asp", "cdp", "pmp", "rcp", "scp", "sdp"]);
  });

  it("Enterprise no se deduce del rango: sus plugins los elige el staff", () => {
    expect(pluginsIncludedIn("enterprise")).toEqual([]);
  });

  it("subir de plan nunca quita nada", () => {
    // Es la propiedad que hace honesto presentar los planes como "+2 plugins".
    for (let i = 1; i < PACKAGE_TIERS.length; i++) {
      const menor = new Set(pluginsIncludedIn(PACKAGE_TIERS[i - 1]));
      const mayor = new Set(pluginsIncludedIn(PACKAGE_TIERS[i]));
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
    // Business no tiene precio anual en este catálogo. Ofrecerlo sería un
    // botón que falla al pulsarlo: el alta muere resolviendo un lookup_key
    // que no existe en Stripe.
    expect(availableTiers(M, "endpoint")).toEqual(["starter", "professional", "business"]);
    expect(availableTiers(Y, "endpoint")).toEqual(["starter", "professional"]);
  });

  it("Enterprise nunca se ofrece en autoservicio, aunque llegara un precio", () => {
    // Se contrata con Tracenium, fuera de Stripe.
    const conEnterprise = pricesFrom(
      [...CATALOG, { line: "endpoint", tier: "enterprise", interval: "monthly", unitAmount: 5000, currency: "usd" }],
      "monthly"
    );
    expect(availableTiers(conEnterprise, "endpoint")).not.toContain("enterprise");
  });

  it("con catálogo vacío no ofrece nada", () => {
    expect(availableTiers(pricesFrom([], "monthly"), "endpoint")).toEqual([]);
  });
});

describe("estimación de coste", () => {
  it("multiplica precio por dispositivo, por línea", () => {
    expect(estimateLine(M, "endpoint", "starter", 50)).toBe(10_000);
    expect(estimateLine(M, "endpoint", "business", 12)).toBe(12_000);
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
        endpoint: { tier: "business", quantity: 500 },
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
    expect(estimateLine(M, "mdm", "business", 10)).toBeNull(); // MDM no tiene ese tier
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
    // Business×10 = $100 < Professional×20 = $120, pero se lleva PMP y CDP
    // de inmediato. Diferir el cargo le regalaría el tier alto todo el mes.
    expect(classifyChange(CATALOG, actual, { interval: "monthly", endpoint: { tier: "business", quantity: 10 } })).toBe("upgrade");
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
    // 14 − 3: los MISMOS 14 días que aplica el backend (PAST_DUE_GRACE_DAYS).
    expect(PAST_DUE_GRACE_DAYS).toBe(14);
    expect(n.message).toContain("11 days");
  });

  it("pasa a error cuando la gracia se agotó", () => {
    const n = statusNotice(
      { status: "past_due", pastDueSince: new Date(NOW - 20 * DAY).toISOString() },
      NOW
    );
    expect(n.severity).toBe("error");
    expect(n.message).toContain("suspended");
  });

  describe("durante la prueba dice QUÉ pasa al terminar — son tres finales distintos", () => {
    const trial = { status: "active", inTrial: true, trialEndsAt: new Date(NOW.getTime() + 10 * DAY).toISOString() };

    it("contratado en Stripe: ese día empieza a cobrarse", () => {
      const n = statusNotice({ ...trial, tier: "starter", billedByStripe: true }, NOW);
      expect(n.severity).toBe("info");
      expect(n.message).toContain("Starter");
      expect(n.message).toContain("first charge");
    });

    it("⭐ sin Stripe: no promete conservar el plan — avisa de que la consola se pausa", () => {
      // Decía "after that you keep the ones in your Business plan" a T109/T113,
      // que no pagan nada: al vencer se bloquean.
      const n = statusNotice({ ...trial, tier: "business", billedByStripe: false }, NOW);
      expect(n.message).not.toMatch(/keep/);
      expect(n.message).toMatch(/Choose a plan before then/);
      expect(n.message).toMatch(/pause/);
    });

    it("sin Stripe y a una semana o menos: pasa a aviso", () => {
      const n = statusNotice(
        { ...trial, tier: "business", trialEndsAt: new Date(NOW.getTime() + 6 * DAY).toISOString() },
        NOW
      );
      expect(n.severity).toBe("warning");
    });

    it("Enterprise conserva su conjunto", () => {
      const n = statusNotice({ ...trial, tier: "enterprise", managed: true }, NOW);
      expect(n.message).toContain("Enterprise plugins");
    });
  });

  it("⭐ prueba vencida sin pagar: error, y dice qué sigue funcionando", () => {
    const n = statusNotice({ status: "active", tier: "business", trialLapsed: true, trialEndsAt: NOW.toISOString() }, NOW);
    expect(n.severity).toBe("error");
    expect(n.message).toMatch(/paused until you choose a plan/);
    expect(n.message).toMatch(/keep reporting inventory/);
  });

  it("una suscripción al día no genera ruido", () => {
    expect(statusNotice({ status: "active", tier: "professional" }, NOW)).toBeNull();
  });
});

describe("addonOffer (ADR-0026)", () => {
  const COV = {
    key: "cdp_coverage",
    plugin: "cdp",
    prices: [
      { interval: "monthly", unitAmount: 250000, currency: "usd" },
      { interval: "yearly", unitAmount: 2500000, currency: "usd" },
    ],
  };
  const SUB = {
    status: "active", billedByStripe: true, hasPaymentMethod: true, billingInterval: "yearly", addons: [],
    entitledPluginKeys: ["amp", "cdp"],
  };

  it("ofrece contratarlo al precio de la periodicidad de la suscripción", () => {
    const o = addonOffer(SUB, COV);
    expect(o).toMatchObject({ state: "available", action: "add", blocked: null });
    expect(o.price.unitAmount).toBe(2500000);
  });

  it("⭐ «incluido en tu prueba» no es «contratado»: sigue ofreciéndose contratarlo", () => {
    const o = addonOffer({ ...SUB, inTrial: true, entitledPluginKeys: ["amp", "cdp_coverage"] }, COV);
    expect(o).toMatchObject({ state: "trial", action: "add" });
  });

  it("contratado → se puede retirar, aunque la cuenta esté en impago", () => {
    expect(addonOffer({ ...SUB, status: "past_due", addons: ["cdp_coverage"] }, COV)).toMatchObject({
      state: "subscribed",
      action: "remove",
      blocked: null,
    });
  });

  it("⭐ sin el plugin que amplía no se ofrece, y dice a qué plan subir", () => {
    const o = addonOffer({ ...SUB, entitledPluginKeys: ["amp", "scp"] }, COV, { pluginTier: "business" });
    expect(o.blocked).toBe("Needs CDP in your plan, from Business. Upgrade the plan first.");
  });

  it("cada obstáculo con su frase, en el orden en que hay que resolverlos", () => {
    expect(addonOffer({ ...SUB, billedByStripe: false, hasPaymentMethod: false }, COV).blocked).toMatch(/plan first/);
    expect(addonOffer({ ...SUB, hasPaymentMethod: false }, COV).blocked).toMatch(/card/);
    expect(addonOffer({ ...SUB, status: "past_due" }, COV).blocked).toMatch(/past due/);
    expect(addonOffer(SUB, { ...COV, prices: [COV.prices[0]] }).blocked).toMatch(/no yearly price/);
  });
});

describe("addonsTotal (ADR-0026)", () => {
  const CAT = [{ key: "cdp_coverage", prices: [{ interval: "monthly", unitAmount: 250000 }, { interval: "yearly", unitAmount: 2500000 }] }];

  it("⭐ suma lo contratado al precio de la periodicidad que se valora", () => {
    expect(addonsTotal(CAT, ["cdp_coverage"], "yearly")).toBe(2500000);
    expect(addonsTotal(CAT, ["cdp_coverage"], "monthly")).toBe(250000);
    expect(addonsTotal(CAT, [], "yearly")).toBe(0);
  });

  it("sin precio para un complemento contratado el total no se sabe: null, no una cifra que lo omite", () => {
    expect(addonsTotal([], ["cdp_coverage"], "yearly")).toBeNull();
    expect(withAddons(600000, null)).toBeNull();
    expect(withAddons(null, 0)).toBeNull();
    expect(withAddons(600000, 2500000)).toBe(3100000);
  });
});

describe("contratado frente a asignado", () => {
  const assigned = { tier: "business", quantity: 50, status: "active", billedByStripe: false, usage: { endpoint: 3 } };

  it("⭐ un plan asignado por el alta NO es un plan contratado", () => {
    // Si lo fuera, preseleccionarlo daría "sin cambios" y no habría botón para
    // pagarlo (T109, T113).
    expect(contractedSelection(assigned)).toBeNull();
    expect(classifyChange([], contractedSelection(assigned), initialSelection(assigned))).toBe("new");
  });

  it("con Stripe, lo contratado es el 'antes'", () => {
    expect(contractedSelection({ ...assigned, billedByStripe: true, billingInterval: "yearly" })).toEqual({
      interval: "yearly",
      endpoint: { tier: "business", quantity: 50 },
      mdm: null,
    });
  });

  it("el selector abre con el plan asignado, pero nunca con Enterprise (no se vende)", () => {
    expect(initialSelection(assigned).endpoint).toEqual({ tier: "business", quantity: 50 });
    expect(initialSelection({ ...assigned, tier: "enterprise" }).endpoint).toBeNull();
  });
});

describe("planStatus: 'active' en Stripe no es 'active' sin Stripe", () => {
  it.each([
    [{ status: "active", billedByStripe: true }, "Active", "success"],
    [{ status: "trialing", billedByStripe: true }, "Trial · subscribed", "info"],
    [{ status: "active", billedByStripe: false, trialEndsAt: new Date(NOW.getTime() + DAY).toISOString() }, "Trial · not billed", "info"],
    [{ status: "active", billedByStripe: false, trialLapsed: true }, "Trial ended", "error"],
    [{ status: "active", billedByStripe: false }, "Not billed", "neutral"],
    [{ status: "active", managed: true }, "Managed", "info"],
    [{ status: "past_due", billedByStripe: true }, "Payment pending", "warning"],
  ])("%j → %s", (sub, label, tone) => {
    expect(planStatus(sub, NOW)).toEqual({ label, tone });
  });
});

describe("chargeTiming", () => {
  it("⭐ un alta con la prueba viva no cobra hoy: cobra al terminarla", () => {
    const t = chargeTiming("new", { trialEndsAt: new Date(NOW.getTime() + 20 * DAY).toISOString() }, NOW);
    expect(t.when).toBe("trial_end");
    expect(t.text).toMatch(/Nothing is charged today/);
  });

  it("a menos de una hora del fin (umbral del backend) se cobra ya", () => {
    const t = chargeTiming("new", { trialEndsAt: new Date(NOW.getTime() + 30 * 60_000).toISOString() }, NOW);
    expect(t.when).toBe("now");
  });

  it("un alta sin prueba cobra el periodo, no 'la diferencia'", () => {
    const t = chargeTiming("new", {}, NOW);
    expect(t.text).not.toMatch(/difference/);
    expect(t.text).toMatch(/first period is charged now/);
  });

  it("⭐ una bajada no promete retener datos", () => {
    expect(chargeTiming("downgrade", {}, NOW).text).not.toMatch(/90 days|kept/);
  });
});

describe("pluginState", () => {
  const SCP = { key: "scp", label: "SCP", title: "Security Compliance", tier_required: "professional" };
  const AMP = { key: "amp", label: "AMP", title: "Asset Management", tier_required: "starter", required: true };

  it("en el plan y concedido: incluido", () => {
    expect(pluginState(SCP, { tier: "professional", entitledPluginKeys: ["amp", "scp"] }).state).toBe("included");
  });

  it("⭐ concedido por la prueba fuera del plan: 'trial', no candado", () => {
    const s = pluginState(SCP, { tier: "starter", entitledPluginKeys: ["amp", "scp"] });
    expect(s.state).toBe("trial");
    expect(s.note).toMatch(/needs Professional after it ends/);
  });

  it("⭐ en el plan pero no concedido (prueba vencida): en pausa", () => {
    const s = pluginState(SCP, { tier: "business", trialLapsed: true, entitledPluginKeys: ["amp"] });
    expect(s).toEqual({ state: "paused", note: "Paused until you choose a plan" });
  });

  it("fuera del plan: qué plan lo trae; en Enterprise, sin tier que prometer", () => {
    expect(pluginState(SCP, { tier: "starter", entitledPluginKeys: ["amp"] }).note).toBe("Requires Professional");
    expect(pluginState(SCP, { tier: "enterprise", managed: true, pluginKeys: [], entitledPluginKeys: ["amp"] }).note).toBe("Not in your plan");
    expect(pluginState(AMP, { tier: "enterprise", managed: true, pluginKeys: [], entitledPluginKeys: ["amp"] }).state).toBe("included");
  });
});

describe("yearlySavingsLabel", () => {
  const row = (tier, interval, unitAmount) => ({ line: "endpoint", tier, interval, unitAmount, currency: "usd" });

  it("el anual a 10× el mensual son 2 meses gratis", () => {
    expect(yearlySavingsLabel([row("starter", "monthly", 200), row("starter", "yearly", 2000)])).toBe("2 months free");
  });

  it("con descuentos distintos por plan no dice nada: una frase mentiría para alguno", () => {
    expect(
      yearlySavingsLabel([
        row("starter", "monthly", 200), row("starter", "yearly", 2000),
        row("business", "monthly", 1000), row("business", "yearly", 11000),
      ])
    ).toBeNull();
  });

  it("sin descuento no dice nada", () => {
    expect(yearlySavingsLabel([row("starter", "monthly", 200), row("starter", "yearly", 2400)])).toBeNull();
  });
});

describe("invoiceStatus", () => {
  it("traduce el vocabulario de Stripe", () => {
    expect(invoiceStatus("open")).toEqual({ label: "Due", tone: "warning" });
    expect(invoiceStatus("uncollectible").label).toBe("Unpaid");
    expect(invoiceStatus("weird").label).toBe("weird");
  });
});

describe("addonOffer con la prueba vencida", () => {
  it("⭐ pide contratar, no 'subir de plan' a quien ya es Business", () => {
    const COV = { key: "cdp_coverage", plugin: "cdp", prices: [{ interval: "monthly", unitAmount: 250000, currency: "usd" }] };
    const o = addonOffer(
      { tier: "business", billedByStripe: false, trialLapsed: true, entitledPluginKeys: ["amp"], status: "active" },
      COV,
      { pluginTier: "business" }
    );
    expect(o.blocked).toMatch(/Subscribe to a plan first/);
  });
});
