// src/components/Billing/billingModel.js
//
// Lo que la pantalla de Billing necesita saber, sin React de por medio.
//
// Está separado del componente para que las reglas —qué plan incluye qué, qué
// se puede cambiar, cuánto va a costar— sean probables sin montar la UI. Son
// justo las que el usuario va a comparar contra su factura.

/** Debe coincidir con licensing/tiers.ts del backend. Orden = rango. */
export const TIERS = ["starter", "professional", "enterprise"];

export const TIER_LABELS = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

/** Precio por dispositivo y mes, en USD. Sólo para PREVISUALIZAR. */
export const TIER_PRICES = { starter: 2, professional: 6, enterprise: 10 };

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

export function tierRank(tier) {
  return TIERS.indexOf(tier);
}

/** Todos los plugins incluidos en un tier, acumulando los de abajo. */
export function pluginsIncludedIn(tier) {
  const rank = tierRank(tier);
  if (rank < 0) return [];
  return TIERS.slice(0, rank + 1).flatMap((t) => TIER_ADDS[t]);
}

/**
 * Coste mensual estimado.
 *
 * ⚠️ Es una ESTIMACIÓN y la pantalla debe decirlo. El importe real lo calcula
 * Stripe e incluye impuestos, prorrateos y cupones que aquí no se conocen.
 * Presentarlo como definitivo genera la discusión de "tu app decía otra cosa".
 */
export function estimateMonthly(tier, quantity) {
  const unit = TIER_PRICES[tier];
  if (!unit || !Number.isFinite(quantity) || quantity < 1) return null;
  return unit * quantity;
}

/**
 * Clasifica un cambio de plan. La UI lo necesita porque subir y bajar se cobran
 * distinto, y el usuario merece saberlo ANTES de confirmar.
 */
export function classifyChange(current, next) {
  if (!current) return "new";
  const tierUp = tierRank(next.tier) > tierRank(current.tier);
  const tierDown = tierRank(next.tier) < tierRank(current.tier);
  const qtyUp = next.quantity > (current.quantity ?? 0);
  const qtyDown = next.quantity < (current.quantity ?? 0);

  if (tierUp || (!tierDown && qtyUp)) return "upgrade";
  if (tierDown || qtyDown) return "downgrade";
  return "none";
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
