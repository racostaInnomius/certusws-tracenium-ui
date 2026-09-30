// src/components/Billing/billingModel.js
//
// Lo que la pantalla de Billing necesita saber, sin React de por medio.
//
// Está separado del componente para que las reglas —qué plan incluye qué, qué
// se puede cambiar, cuánto va a costar— sean probables sin montar la UI. Son
// justo las que el usuario va a comparar contra su factura.

/**
 * Dos LÍNEAS de producto, no una escalera única.
 *
 * Endpoints (PCs y servidores) y MDM/MAM (móviles) se compran y se cuentan por
 * separado: un cliente puede tener 500 licencias de endpoint y 30 de móvil, o
 * sólo lo segundo. Presentarlas como un único plan obligaría a comprar
 * licencias de PC para gestionar teléfonos.
 */
export const LINES = ["endpoint", "mdm"];

export const LINE_LABELS = {
  endpoint: "Endpoints",
  mdm: "MDM / MAM",
};

export const LINE_HINTS = {
  endpoint: "PCs, laptops and servers",
  mdm: "managed mobiles — inventory included",
};

/**
 * Debe coincidir con licensing/tiers.ts del backend. Orden = rango.
 *
 * `starter | professional | business` son PAQUETES (Stripe, aditivos).
 * `enterprise` no es un paquete más alto: se contrata con Tracenium, fuera de
 * Stripe, y sus plugins los elige el staff uno a uno. Hasta 2026-09-16 el
 * paquete alto se llamaba `enterprise`; hoy es `business`.
 */
export const TIERS = ["starter", "professional", "business", "enterprise"];

/** Los que se venden en autoservicio. */
export const PACKAGE_TIERS = ["starter", "professional", "business"];

/** El plan gestionado por Tracenium (conjunto explícito de plugins). */
export const MANAGED_TIER = "enterprise";

/**
 * Tiers ofrecidos en cada línea. MDM sólo tiene Professional hoy.
 *
 * ⚠️ Enterprise NO está: no tiene precio en Stripe y el PlanPicker no puede
 * ofrecerlo — el alta moriría resolviendo un precio que no existe.
 */
export const LINE_TIERS = {
  endpoint: ["starter", "professional", "business"],
  mdm: ["professional"],
};

/**
 * Periodicidad. Es de la SUSCRIPCIÓN, no de cada línea: Stripe exige que todos
 * los items compartan intervalo y rechaza la mezcla, así que ofrecer "endpoints
 * anual + MDM mensual" sería dejar construir algo que la API no acepta.
 */
export const INTERVALS = ["monthly", "yearly"];

export const INTERVAL_LABELS = {
  monthly: "Monthly",
  yearly: "Yearly",
};

export const TIER_LABELS = {
  starter: "Starter",
  professional: "Professional",
  business: "Business",
  enterprise: "Enterprise",
};

/** La etiqueta de un tier, o el valor tal cual si no se conoce (nunca vacío). */
export function tierLabel(tier) {
  if (!tier) return "";
  return TIER_LABELS[tier] ?? String(tier);
}

/**
 * Los precios YA NO SE ESCRIBEN AQUÍ. Vienen de Stripe, vía /billing/catalog.
 *
 * Con una sola periodicidad tener la tabla a mano era una duplicación
 * tolerable. Con mensual y anual deja de serlo: el anual no es doce veces el
 * mensual —lleva descuento— así que la cifra tendría que copiarse a mano cada
 * vez que el negocio la mueva, en la única pantalla que el usuario compara
 * contra su factura.
 *
 * Devuelve importes en la UNIDAD MÍNIMA de la divisa (céntimos), que es como
 * los da Stripe. Convertir aquí introduciría redondeos que no cuadran con el
 * recibo.
 */
export function pricesFrom(catalog, interval) {
  const out = {};
  for (const p of catalog ?? []) {
    if (p.interval !== interval || typeof p.unitAmount !== "number") continue;
    (out[p.line] ??= {})[p.tier] = p.unitAmount;
  }
  return out;
}

/**
 * "2 months free" junto al selector de periodicidad — SÓLO si los precios de
 * Stripe lo dicen, y lo dicen para todos los planes por igual. Con descuentos
 * distintos por plan, una sola frase mentiría para alguno: entonces null.
 */
export function yearlySavingsLabel(catalog) {
  const monthly = pricesFrom(catalog, "monthly");
  const yearly = pricesFrom(catalog, "yearly");
  const months = new Set();
  for (const line of Object.keys(monthly)) {
    for (const [tier, m] of Object.entries(monthly[line])) {
      const y = yearly[line]?.[tier];
      if (typeof y !== "number" || !(m > 0)) continue;
      months.add(Math.round((12 * m - y) / m));
    }
  }
  if (months.size !== 1) return null;
  const [free] = months;
  return free > 0 ? `${free} month${free === 1 ? "" : "s"} free` : null;
}

/** La divisa del catálogo, para formatear. Todos los precios comparten una. */
export function currencyOf(catalog) {
  return catalog?.[0]?.currency ?? "usd";
}

/**
 * Tiers que REALMENTE se pueden contratar en esta periodicidad.
 *
 * Ofrecer un plan sin precio en Stripe sería enseñar un botón que falla al
 * pulsarlo: el alta muere resolviendo un lookup_key inexistente.
 */
export function availableTiers(prices, line) {
  return LINE_TIERS[line].filter((t) => typeof prices?.[line]?.[t] === "number");
}

/**
 * Qué plugins suma cada nivel — lo que el nivel AÑADE, no lo que incluye.
 *
 * Se presenta así porque los planes son aditivos: "Professional = Starter + SCP
 * + RCP" es lo que el comercial explica, y una lista completa por plan
 * escondería que subir nunca quita nada.
 */
export const TIER_ADDS = {
  starter: ["amp", "sdp"],
  professional: ["scp", "rcp"],
  // `asp` (Assessment Suite) exige `business` en el catálogo del backend: se
  // enseña para que el plan no esconda algo que ya incluye.
  business: ["pmp", "cdp", "asp"],
};

/**
 * Qué incluye la línea de MDM. No son plugins del catálogo de endpoints: los
 * móviles no pasan por ese camino, y su inventario viene con el propio plan de
 * MDM — por eso un cliente sólo-MDM no necesita comprar endpoints.
 */
export const MDM_INCLUDES = ["Mobile inventory", "Profiles and policies", "Remote commands"];

export function tierRank(tier) {
  return TIERS.indexOf(tier);
}

/**
 * Todos los plugins incluidos en un PAQUETE, acumulando los de abajo.
 *
 * Enterprise no se deduce de su rango —sus plugins son los que eligió el staff—
 * así que aquí devuelve [] y quien lo necesite usa `pluginKeys`.
 */
export function pluginsIncludedIn(tier) {
  const rank = PACKAGE_TIERS.indexOf(tier);
  if (rank < 0) return [];
  return PACKAGE_TIERS.slice(0, rank + 1).flatMap((t) => TIER_ADDS[t]);
}

/**
 * Gracia por impago, en días. Espejo de PAST_DUE_GRACE_DAYS del backend
 * (licensing/tiers.ts). Eran 15 aquí mientras el backend corta a los 14: el
 * aviso prometía un día que el sistema no respetaba.
 */
export const PAST_DUE_GRACE_DAYS = 14;

/** Coste de UNA línea, en céntimos. Ver estimateTotal para el total. */
export function estimateLine(prices, line, tier, quantity) {
  const unit = prices?.[line]?.[tier];
  if (!unit || !Number.isFinite(quantity) || quantity < 1) return null;
  return unit * quantity;
}

/**
 * Coste POR PERIODO de toda la selección, en céntimos.
 *
 * "Por periodo" y no "al mes": con periodicidad anual esto es lo que se cobra
 * de una vez. Presentarlo mensualizado escondería el importe que el usuario va
 * a ver en la tarjeta.
 *
 * ⚠️ Es una ESTIMACIÓN y la pantalla debe decirlo. El importe real lo calcula
 * Stripe e incluye impuestos, prorrateos y cupones que aquí no se conocen.
 */
export function estimateTotal(catalog, selection) {
  // ⚠️ Los precios salen de la periodicidad DE ESTA SELECCIÓN, no de una tabla
  // que le pasen desde fuera. Con una tabla fija, comparar dos selecciones de
  // periodicidad distinta las valoraba a las dos con los mismos precios y el
  // cambio mensual→anual se volvía invisible.
  const prices = pricesFrom(catalog, selection?.interval ?? "monthly");

  let total = 0;
  let any = false;
  for (const line of LINES) {
    const sel = selection?.[line];
    if (!sel) continue;
    const sub = estimateLine(prices, line, sel.tier, sel.quantity);
    if (sub === null) return null;
    total += sub;
    any = true;
  }
  return any ? total : null;
}

/**
 * ¿Este cambio se cobra ya, o al cierre del ciclo?
 *
 * HAY DOS MOTIVOS INDEPENDIENTES PARA COBRAR YA, y ninguna regla simple los
 * cubre a la vez. Se descartaron las dos evidentes:
 *
 *   * "mira si el tier sube" — falla con Professional×20 ($120) → Starter×100
 *     ($200): tier más bajo, gasto mayor. Diferirlo regala 80 licencias hasta
 *     el siguiente ciclo.
 *   * "mira si el coste sube" — falla con Professional×20 ($120) →
 *     Enterprise×10 ($100): gasta menos, pero se lleva PMP y CDP de inmediato.
 *     Diferirlo regala el tier alto durante el resto del mes.
 *
 * Así que se cobra ya si sube CUALQUIERA de las dos: más capacidad o más
 * puestos. Sólo cuando no sube ninguna es una bajada pura, que se aplica al
 * cierre sin devolución.
 *
 * Con dos líneas esto importa más, no menos: subir MDM y bajar endpoints en el
 * mismo guardado es un caso normal.
 */
export function classifyChange(catalog, current, next) {
  const has = (s) => s && LINES.some((l) => s[l]);
  if (!has(current)) return has(next) ? "new" : "none";
  if (!has(next)) return "downgrade";

  // ¿Gana capacidad en alguna línea? Estrenar una línea cuenta como ganarla.
  const tierUp = LINES.some((l) => {
    const a = current?.[l] ?? null;
    const b = next?.[l] ?? null;
    if (!b) return false;
    if (!a) return true;
    return tierRank(b.tier) > tierRank(a.tier);
  });

  // Cada lado se valora CON SU PROPIA periodicidad, y con eso el cambio de
  // ciclo se clasifica solo: pasar de mensual a anual multiplica lo que se
  // factura ya, así que sale "upgrade" — que es justo lo que Stripe va a hacer.
  const before = estimateTotal(catalog, current);
  const after = estimateTotal(catalog, next);
  // Un coste no estimable no se usa como motivo de cargo: equivocarse hacia
  // ahí sería cobrar de más por un cálculo que no supimos hacer.
  const costUp = before !== null && after !== null && after > before;

  if (tierUp || costUp) return "upgrade";

  // Cambiar de periodicidad nunca es "sin cambios", aunque el importe no se
  // mueva: es otra suscripción para Stripe.
  const same =
    (current?.interval ?? null) === (next?.interval ?? null) &&
    LINES.every((l) => {
    const a = current?.[l] ?? null;
    const b = next?.[l] ?? null;
      if (!a && !b) return true;
      if (!a || !b) return false;
      return a.tier === b.tier && a.quantity === b.quantity;
    });
  return same ? "none" : "downgrade";
}

/**
 * ¿El número de licencias elegido da para la flota que ya existe?
 *
 * Es la decisión más importante de la pantalla y se estaba tomando A CIEGAS: se
 * pedía un número sin decir contra qué. Con el uso real delante, elegir de menos
 * deja de ser un descubrimiento para el día que alguien no pueda dar de alta un
 * equipo.
 *
 * Devuelve `null` cuando no hay nada que advertir — el caso normal no debe
 * generar ruido.
 */
export function usageWarning(quantity, used) {
  if (!Number.isFinite(used) || !Number.isFinite(quantity) || quantity < 1) return null;

  if (used > graceCeiling(quantity)) {
    return {
      severity: "error",
      message:
        `You already have ${used} devices, and ${quantity} licenses cap you at ` +
        `${graceCeiling(quantity)} including the margin. You won't be able to ` +
        `enroll more, and the extras fall outside coverage.`,
    };
  }
  if (used > quantity) {
    return {
      severity: "warning",
      message:
        `You have ${used} devices and are buying ${quantity} licenses. You fit ` +
        `within the 10% margin (up to ${graceCeiling(quantity)}), but with no ` +
        `room to grow.`,
    };
  }
  return null;
}

/** Cuántas licencias sugerir a partir de lo que ya hay enrolado. */
export function suggestedQuantity(used) {
  if (!Number.isFinite(used) || used < 1) return 1;
  return used;
}

/**
 * Cuántos equipos se pueden enrolar con N licencias.
 *
 * Es el techo de gracia de ADR-0005: el tope contratado más un 10%. Se calcula
 * igual que en el backend —`L + ceil(L*0.10)`, aditivo— porque una discrepancia
 * aquí haría que la pantalla prometiera un margen distinto al que el
 * enrolamiento aplica.
 */
export function graceCeiling(quantity) {
  if (!Number.isFinite(quantity) || quantity < 1) return 0;
  return quantity + Math.ceil(quantity * 0.1);
}

/**
 * Una línea contratada, o null. Sin cantidad positiva NO está contratada: es
 * `null`, no "× 0" (ver `classifyChange`, que con un 0 clasificaba un alta
 * como bajada).
 */
export function asLine(tier, quantity) {
  return tier && Number.isFinite(quantity) && quantity > 0 ? { tier, quantity } : null;
}

/**
 * Lo que el tenant tiene CONTRATADO EN STRIPE — el "antes" de un cambio.
 *
 * ⚠️ UN PLAN ASIGNADO NO ES UN PLAN CONTRATADO. El alta siembra `tier` y
 * `quantity` a todos los tenants (T109, T113: Business × 50 en prueba, sin
 * suscripción). Tomarlo como contratado hacía que la pantalla viera "sin
 * cambios" al preseleccionarlo y NO ofreciera ningún botón: el cliente no
 * podía pagar el plan que tenía delante sin tocar antes una cifra.
 */
export function contractedSelection(sub) {
  if (!sub?.billedByStripe) return null;
  return {
    interval: sub.billingInterval ?? "monthly",
    endpoint: asLine(sub.tier, sub.quantity ?? sub.licensedQuantity),
    mdm: asLine(sub.mdmTier, sub.mdmQuantity),
  };
}

/**
 * Con qué se abre el selector: lo contratado, o si no hay, el plan asignado.
 *
 * ⚠️ Sin cantidad NO se cae a 1: se prefiere el tope que el gate aplica y, en su
 * defecto, la flota. Un 1 preseleccionado recortaba al confirmar cualquier otro
 * cambio el tope del cliente a un equipo. MDM sólo con cantidad contratada: con
 * tier y sin cantidad se colaba una licencia de móvil que nadie pidió.
 */
export function initialSelection(sub) {
  const endpointTier = PACKAGE_TIERS.includes(sub?.tier) ? sub.tier : null;
  return {
    // Un cliente anual que entra a tocar licencias no se va a mensual solo.
    interval: sub?.billingInterval ?? "monthly",
    endpoint: endpointTier
      ? { tier: endpointTier, quantity: sub.quantity ?? sub.licensedQuantity ?? sub.usage?.endpoint ?? 1 }
      : null,
    mdm: sub?.mdmTier && sub?.mdmQuantity > 0 ? { tier: sub.mdmTier, quantity: sub.mdmQuantity } : null,
  };
}

/**
 * La etiqueta de estado del plan y su tono (`success | info | warning | error |
 * neutral`). Distingue lo que Stripe no puede distinguir: una fila `active` sin
 * suscripción no está "al día" — nadie ha pagado nada.
 */
export function planStatus(sub, now = new Date()) {
  if (!sub) return { label: "No plan", tone: "neutral" };
  if (sub.managed) return { label: "Managed", tone: "info" };
  if (sub.trialLapsed) return { label: "Trial ended", tone: "error" };
  const trialAlive = Boolean(sub.trialEndsAt) && new Date(sub.trialEndsAt) > now;
  if (!sub.billedByStripe) {
    return trialAlive ? { label: "Trial · not billed", tone: "info" } : { label: "Not billed", tone: "neutral" };
  }
  switch (sub.status) {
    case "trialing":
      return { label: "Trial · subscribed", tone: "info" };
    case "active":
      return { label: "Active", tone: "success" };
    case "past_due":
      return { label: "Payment pending", tone: "warning" };
    case "incomplete":
      return { label: "Payment not completed", tone: "warning" };
    case "unpaid":
      return { label: "Unpaid", tone: "error" };
    case "canceled":
      return { label: "Canceled", tone: "error" };
    case "incomplete_expired":
      return { label: "Expired unpaid", tone: "error" };
    default:
      return { label: String(sub.status ?? "Unknown"), tone: "neutral" };
  }
}

/** Estados de factura de Stripe en el idioma del usuario. */
const INVOICE_STATUS = {
  paid: { label: "Paid", tone: "success" },
  open: { label: "Due", tone: "warning" },
  draft: { label: "Draft", tone: "neutral" },
  void: { label: "Voided", tone: "neutral" },
  uncollectible: { label: "Unpaid", tone: "error" },
};

export function invoiceStatus(status) {
  return INVOICE_STATUS[status] ?? { label: String(status ?? "—"), tone: "neutral" };
}

/** Días naturales que faltan hasta `date` (redondeando hacia arriba). */
function daysUntil(date, now) {
  return Math.ceil((new Date(date) - now) / 86_400_000);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Cuándo se cobra un cambio, en una frase — lo que el pie del selector y el
 * diálogo dicen junto al importe.
 *
 * El backend aplaza el primer cobro de una suscripción NUEVA al fin de la prueba
 * si quedan al menos una hora (billing.service::stripeTrialEndFor). Aquí se
 * aplica el mismo umbral para no prometer un aplazamiento que no ocurrirá.
 */
export const TRIAL_END_MIN_LEAD_MS = 60 * 60 * 1000;

export function chargeTiming(change, sub, now = new Date()) {
  if (change === "new") {
    const ends = sub?.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    if (ends && ends - now >= TRIAL_END_MIN_LEAD_MS) {
      return {
        when: "trial_end",
        date: ends,
        text: `Nothing is charged today. The first charge is on ${ends.toLocaleDateString()}, when your trial ends.`,
      };
    }
    return { when: "now", date: now, text: "The first period is charged now to your card on file." };
  }
  if (change === "upgrade") {
    return { when: "now", date: now, text: "The difference is charged now, prorated for the rest of the cycle." };
  }
  if (change === "downgrade") {
    const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
    return {
      when: "period_end",
      date: end,
      text: `Takes effect at the end of the current cycle${end ? ` (${end.toLocaleDateString()})` : ""}, with no refund.`,
    };
  }
  return null;
}

/**
 * El mensaje de estado de la suscripción, o null si no hay nada que decir.
 *
 * Devuelve `severity` para que la pantalla no tenga que interpretar el estado
 * —y para que "te quedan 3 días" y "estás al día" no se pinten igual.
 */
export function statusNotice(sub, now = new Date()) {
  if (!sub) return null;

  // La prueba terminó y nadie contrató: la consola está bloqueada y los plugins
  // en el suelo. Es lo primero que hay que decir, y dónde se arregla.
  if (sub.trialLapsed) {
    return {
      severity: "error",
      message:
        `Your trial ended${sub.trialEndsAt ? ` on ${new Date(sub.trialEndsAt).toLocaleDateString()}` : ""}. ` +
        "The console and plugins are paused until you choose a plan — devices stay enrolled and " +
        "keep reporting inventory.",
    };
  }

  if (sub.status === "past_due" && sub.pastDueSince) {
    const since = new Date(sub.pastDueSince);
    const daysLeft = PAST_DUE_GRACE_DAYS - Math.floor((now - since) / 86_400_000);
    return daysLeft > 0
      ? {
          severity: "warning",
          message:
            `We couldn't charge your last invoice. Update the payment method: ` +
            `${daysLeft} day${daysLeft === 1 ? "" : "s"} left before plugins are ` +
            `suspended.`,
        }
      : {
          severity: "error",
          message:
            "The subscription is suspended for non-payment. Update the payment " +
            "method to restore service.",
        };
  }

  if (sub.inTrial && sub.trialEndsAt) {
    const days = daysUntil(sub.trialEndsAt, now);
    const date = new Date(sub.trialEndsAt).toLocaleDateString();
    const lead = `You're trialing every plugin — ${plural(days, "day")} left (until ${date}).`;
    // Tres finales distintos, y prometer el equivocado es lo que genera la
    // reclamación: el Enterprise conserva su conjunto, quien ya contrató paga
    // ese día, y quien no contrató pierde la consola.
    if (sub.managed) return { severity: "info", message: `${lead} After that you keep your Enterprise plugins.` };
    if (sub.billedByStripe) {
      return {
        severity: "info",
        message: `${lead} Your ${tierLabel(sub.tier) || "plan"} subscription starts then, and that's the first charge.`,
      };
    }
    return {
      severity: days <= 7 ? "warning" : "info",
      message: `${lead} Choose a plan before then: without one, the console and plugins pause when the trial ends.`,
    };
  }

  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    return {
      severity: "warning",
      message: `The subscription won't renew. Service continues until ${new Date(
        sub.currentPeriodEnd
      ).toLocaleDateString()}.`,
    };
  }

  return null;
}

/**
 * El estado de un plugin del catálogo para ESTE tenant, y la frase que lo explica.
 *
 *   included  en el plan y concedido
 *   trial     concedido por la prueba, fuera del plan — se pierde al terminar
 *   paused    en el plan pero no concedido (prueba vencida sin pagar, impago)
 *   locked    fuera del plan
 *
 * "Concedido" sale de `entitledPluginKeys`, que resuelve el MISMO código que
 * gatea la API. Deducirlo del rango en la UI decía "Requires Professional" de
 * un plugin que el cliente estaba usando en su prueba.
 */
export function pluginState(plugin, sub) {
  const managed = Boolean(sub?.managed);
  const inPlan = managed
    ? Boolean(plugin.required) || (sub?.pluginKeys ?? []).includes(plugin.key)
    : !plugin.tier_required || tierRank(sub?.tier) >= tierRank(plugin.tier_required);
  const entitled = Array.isArray(sub?.entitledPluginKeys) ? sub.entitledPluginKeys.includes(plugin.key) : inPlan;

  if (entitled && inPlan) return { state: "included", note: "Included in your plan" };
  if (entitled) {
    return {
      state: "trial",
      note: managed
        ? "Included in your trial — not part of your Enterprise plan after it ends"
        : `Included in your trial — needs ${tierLabel(plugin.tier_required)} after it ends`,
    };
  }
  if (inPlan) {
    return {
      state: "paused",
      note: sub?.trialLapsed ? "Paused until you choose a plan" : "Paused until the subscription is paid",
    };
  }
  return { state: "locked", note: managed ? "Not in your plan" : `Requires ${tierLabel(plugin.tier_required)}` };
}

/** Estados en los que el backend deja AÑADIR un cargo (retirar se puede siempre). */
const ADDON_ADDABLE_STATUSES = ["active", "trialing"];

/**
 * ADR-0026 — qué se puede hacer con un complemento desde Billing, y si no, POR QUÉ.
 *
 * `addon` es la entrada de `/billing/catalog` (`{ key, title, plugin, prices[] }`),
 * `sub` el resumen y `pluginTier` el plan desde el que se incluye el plugin que
 * amplía (del catálogo de plugins), para decir a qué plan hay que subir. Devuelve:
 *
 *   state    subscribed | trial | available
 *   action   remove | add
 *   blocked  null, o la frase que explica el obstáculo — se enseña donde está
 *            el botón, en vez de deshabilitarlo sin decir nada
 *   price    el precio en la periodicidad de la suscripción, o null
 *
 * ⚠️ «Incluido en tu prueba» NO es «contratado»: el trial concede todos los
 * complementos sin que nadie los pague, y al acabar se congelan. Por eso el
 * estado sale de `sub.addons` (lo que Stripe cobra), no de los derechos.
 *
 * Las mismas reglas que el backend (`setAddonBySelf`): esto sólo evita ofrecer
 * un botón que acabaría en 409.
 */
export function addonOffer(sub, addon, { pluginTier = null } = {}) {
  const interval = sub?.billingInterval ?? "monthly";
  const price = (addon?.prices ?? []).find((p) => p.interval === interval) ?? null;
  const contracted = (sub?.addons ?? []).includes(addon?.key);

  if (contracted) return { state: "subscribed", action: "remove", blocked: null, price, interval };

  const inTrial = Boolean(sub?.inTrial) && (sub?.entitledPluginKeys ?? []).includes(addon?.key);
  // El plugin que el complemento amplía tiene que estar en el plan: CDP Coverage
  // sin Crypto Discovery sería pagar por algo que no se puede usar.
  const pluginMissing = addon?.plugin && Array.isArray(sub?.entitledPluginKeys) && !sub.entitledPluginKeys.includes(addon.plugin);
  let blocked = null;
  // Sin suscripción en Stripe lo primero es contratar, falte o no el plugin:
  // con la prueba vencida el plugin "falta" aunque el plan sea Business, y
  // "sube de plan" mandaba a comprar lo que ya se tiene.
  if (!sub?.billedByStripe) blocked = "Subscribe to a plan first: the add-on is billed on the same subscription.";
  else if (pluginMissing) blocked = `Needs ${String(addon.plugin).toUpperCase()} in your plan${pluginTier ? `, from ${tierLabel(pluginTier)}` : ""}. Upgrade the plan first.`;
  else if (!sub?.hasPaymentMethod) blocked = "Save a card first.";
  else if (!ADDON_ADDABLE_STATUSES.includes(sub?.status))
    blocked = `Your subscription is ${String(sub?.status ?? "inactive").replace("_", " ")}. Fix the payment before adding to it.`;
  else if (!price) blocked = `There's no ${INTERVAL_LABELS[interval]?.toLowerCase() ?? interval} price for this add-on yet.`;

  return { state: inTrial ? "trial" : "available", action: "add", blocked, price, interval };
}

/**
 * ADR-0026 — lo que suman los complementos CONTRATADOS en una periodicidad.
 *
 * Existe porque «Your plan» enseñaba sólo las líneas: con CDP Coverage anual
 * contratado decía $6.000 de próximo cargo cuando la factura iba a ser de
 * $31.000. Es la cifra que el cliente compara contra su factura.
 *
 * Periodicidad del LADO que se valora: al pasar de mensual a anual el backend
 * cambia también el item del complemento, así que el «después» lleva su precio
 * anual. `null` si un complemento contratado no tiene precio en esa
 * periodicidad: sin él el total no se sabe, y un total que no lo cuenta mentiría.
 */
export function addonsTotal(addonCatalog, contractedKeys, interval) {
  let total = 0;
  for (const key of contractedKeys ?? []) {
    const entry = (addonCatalog ?? []).find((a) => a.key === key);
    const price = entry?.prices?.find((p) => p.interval === interval);
    if (!price || !Number.isFinite(price.unitAmount)) return null;
    total += price.unitAmount;
  }
  return total;
}

/** Líneas + complementos. `null` si cualquiera de las dos partes no se sabe. */
export function withAddons(linesTotal, addonTotal) {
  if (linesTotal === null || linesTotal === undefined) return null;
  if (addonTotal === null || addonTotal === undefined) return null;
  return linesTotal + addonTotal;
}
