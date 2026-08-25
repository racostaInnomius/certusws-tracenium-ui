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
  endpoint: "PCs, portátiles y servidores",
  mdm: "móviles gestionados — incluye su inventario",
};

/** Debe coincidir con licensing/tiers.ts del backend. Orden = rango. */
export const TIERS = ["starter", "professional", "enterprise"];

/** Tiers ofrecidos en cada línea. MDM sólo tiene Professional hoy. */
export const LINE_TIERS = {
  endpoint: ["starter", "professional", "enterprise"],
  mdm: ["professional"],
};

/**
 * Periodicidad. Es de la SUSCRIPCIÓN, no de cada línea: Stripe exige que todos
 * los items compartan intervalo y rechaza la mezcla, así que ofrecer "endpoints
 * anual + MDM mensual" sería dejar construir algo que la API no acepta.
 */
export const INTERVALS = ["monthly", "yearly"];

export const INTERVAL_LABELS = {
  monthly: "Mensual",
  yearly: "Anual",
};

export const TIER_LABELS = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

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
  enterprise: ["pmp", "cdp"],
};

/**
 * Qué incluye la línea de MDM. No son plugins del catálogo de endpoints: los
 * móviles no pasan por ese camino, y su inventario viene con el propio plan de
 * MDM — por eso un cliente sólo-MDM no necesita comprar endpoints.
 */
export const MDM_INCLUDES = ["Inventario de móviles", "Perfiles y políticas", "Comandos remotos"];

export function tierRank(tier) {
  return TIERS.indexOf(tier);
}

/** Todos los plugins incluidos en un tier, acumulando los de abajo. */
export function pluginsIncludedIn(tier) {
  const rank = tierRank(tier);
  if (rank < 0) return [];
  return TIERS.slice(0, rank + 1).flatMap((t) => TIER_ADDS[t]);
}

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
        `Ya tienes ${used} equipos y con ${quantity} licencias el tope —margen ` +
        `incluido— es ${graceCeiling(quantity)}. No podrás enrolar más, y los que ` +
        `sobran quedan fuera de cobertura.`,
    };
  }
  if (used > quantity) {
    return {
      severity: "warning",
      message:
        `Tienes ${used} equipos y estás contratando ${quantity} licencias. Entras ` +
        `por el margen del 10% (hasta ${graceCeiling(quantity)}), pero sin holgura ` +
        `para crecer.`,
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
 * El mensaje de estado de la suscripción, o null si no hay nada que decir.
 *
 * Devuelve `severity` para que la pantalla no tenga que interpretar el estado
 * —y para que "te quedan 3 días" y "estás al día" no se pinten igual.
 */
export function statusNotice(sub, now = new Date()) {
  if (!sub) return null;

  if (sub.status === "past_due" && sub.pastDueSince) {
    const since = new Date(sub.pastDueSince);
    const daysLeft = 15 - Math.floor((now - since) / 86_400_000);
    return daysLeft > 0
      ? {
          severity: "warning",
          message:
            `No pudimos cobrar el último recibo. Actualiza el método de pago: ` +
            `quedan ${daysLeft} día${daysLeft === 1 ? "" : "s"} antes de que se ` +
            `suspendan los plugins.`,
        }
      : {
          severity: "error",
          message:
            "La suscripción está suspendida por falta de pago. Actualiza el " +
            "método de pago para restablecer el servicio.",
        };
  }

  if (sub.inTrial && sub.trialEndsAt) {
    const days = Math.ceil((new Date(sub.trialEndsAt) - now) / 86_400_000);
    return {
      severity: "info",
      message:
        `Estás probando todos los plugins. Quedan ${days} día${days === 1 ? "" : "s"} ` +
        `de prueba; después se mantendrán los de tu plan ` +
        `${TIER_LABELS[sub.tier] ?? ""}.`.trim(),
    };
  }

  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    return {
      severity: "warning",
      message: `La suscripción no se renovará. El servicio continúa hasta el ${new Date(
        sub.currentPeriodEnd
      ).toLocaleDateString()}.`,
    };
  }

  return null;
}
