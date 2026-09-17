// src/components/Billing/staffPlanModel.js
//
// El plan que fija el STAFF para un tenant: el formulario del alta ("Create New
// Tenant") y el de "Edit plan" en Subscriptions. Sin React, para poder probar
// las reglas —qué se manda, qué se exige— sin montar diálogos.
//
// Habla con PUT /api/v1/billing/admin/subscriptions/:tenantId (backend
// admin.service::setSubscriptionByStaff). Ese endpoint es un REEMPLAZO
// completo: `trialEndsAt` y `mdm` viajan SIEMPRE, aunque valgan "nada".

import { MANAGED_TIER, PACKAGE_TIERS, TIERS, tierLabel } from "./billingModel";

/**
 * La prueba estándar de alta. Espejo de TRIAL_MONTHS del backend (el trigger
 * que siembra un tenant nuevo concede exactamente esto).
 */
export const TRIAL_MONTHS = 1;

/** El mismo tope que aplica el backend a la fecha del trial. */
export const MAX_TRIAL_MONTHS = 12;

/** `YYYY-MM-DD` de hoy + N meses, en UTC — lo que espera un <input type="date">. */
export function dateInMonths(months, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Un día del calendario → el instante que se manda: el FINAL de ese día en UTC.
 * "Hasta el 26 de octubre" significa que el 26 todavía se tiene acceso.
 */
export function endOfDayIso(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? "")) ? `${date}T23:59:59.000Z` : null;
}

/**
 * Lo que trae cada tier al elegirlo. Un paquete nace con el trial estándar,
 * como lo siembra el backend; Enterprise sin trial, porque lo que se negocia
 * con el cliente es el conjunto de plugins, no una prueba.
 */
export function tierDefaults(tier, now = new Date()) {
  const managed = tier === MANAGED_TIER;
  return {
    trialEnabled: !managed,
    trialEndsOn: managed ? "" : dateInMonths(TRIAL_MONTHS, now),
  };
}

/** Formulario vacío para un alta. */
export function newPlan(now = new Date()) {
  return {
    tier: "starter",
    quantity: "",
    ...tierDefaults("starter", now),
    pluginKeys: [],
    mdmIncluded: false,
    mdmQuantity: "",
    canceled: false,
  };
}

/**
 * Formulario a partir de una fila de GET /billing/admin/subscriptions.
 *
 * La fecha del trial se conserva aunque ya haya vencido: si el staff sólo toca
 * las licencias, reenviar la fecha vieja deja las cosas como estaban; mandar
 * `null` le borraría a ese tenant el rastro de que tuvo prueba.
 */
export function planFromRow(row) {
  const trialEndsOn = row?.trialEndsAt ? String(row.trialEndsAt).slice(0, 10) : "";
  return {
    tier: TIERS.includes(row?.tier) ? row.tier : "starter",
    quantity: row?.quantity ?? row?.maxDevices ?? "",
    trialEnabled: Boolean(trialEndsOn),
    trialEndsOn,
    pluginKeys: Array.isArray(row?.pluginKeys) ? [...row.pluginKeys] : [],
    mdmIncluded: Boolean(row?.mdmTier),
    mdmQuantity: row?.mdmQuantity ?? "",
    canceled: row?.status === "canceled",
  };
}

function toInt(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

/**
 * Errores por campo, o `{}` si el plan se puede mandar.
 *
 * Se validan aquí las mismas reglas que el backend para que el error aparezca
 * junto al campo al escribir, no como un 400 al guardar. El backend sigue
 * siendo quien decide.
 */
export function validatePlan(plan, now = new Date()) {
  const errors = {};
  if (!TIERS.includes(plan?.tier)) errors.tier = "Choose a plan.";

  const q = toInt(plan?.quantity);
  if (!(q >= 1 && q <= 1_000_000)) errors.quantity = "Licenses must be a whole number of at least 1.";

  if (plan?.trialEnabled) {
    const iso = endOfDayIso(plan.trialEndsOn);
    if (!iso) {
      errors.trialEndsOn = "Pick the day full access ends.";
    } else if (plan.trialEndsOn > dateInMonths(MAX_TRIAL_MONTHS, now)) {
      errors.trialEndsOn = `A trial can run at most ${MAX_TRIAL_MONTHS} months from today.`;
    }
  }

  if (plan?.mdmIncluded) {
    const m = toInt(plan.mdmQuantity);
    if (!(m >= 1 && m <= 1_000_000)) errors.mdmQuantity = "MDM/MAM needs at least 1 license.";
  }
  return errors;
}

/** El cuerpo del PUT. Supone un plan que `validatePlan` ya dio por bueno. */
export function planPayload(plan) {
  const managed = plan.tier === MANAGED_TIER;
  const body = {
    tier: plan.tier,
    quantity: toInt(plan.quantity),
    trialEndsAt: plan.trialEnabled ? endOfDayIso(plan.trialEndsOn) : null,
    // Sólo Enterprise lleva conjunto; un paquete que lo mandara recibiría 400.
    pluginKeys: managed ? [...new Set(plan.pluginKeys ?? [])].sort() : null,
    mdm: plan.mdmIncluded ? { included: true, quantity: toInt(plan.mdmQuantity) } : { included: false },
  };
  // El estado sólo lo fija el staff en planes que NO pasan por Stripe; el
  // formulario sólo enseña el interruptor en Enterprise.
  if (managed) body.status = plan.canceled ? "canceled" : "active";
  return body;
}

/**
 * Lo que el backend dice al rechazar, en palabras de la pantalla. Los 409 no
 * son errores de formulario: dicen que falta un paso fuera de aquí.
 */
export function planErrorMessage(err) {
  const code = err?.body?.error ?? err?.code ?? null;
  switch (code) {
    case "CANCEL_STRIPE_FIRST":
      return "This tenant pays through Stripe. Cancel that subscription before moving it to Enterprise.";
    case "STRIPE_MANAGED":
      return "Plan, licenses and MDM of a Stripe subscription are managed by Stripe. Only the trial date can change here.";
    case "NOT_BILLABLE":
      return "This tenant has no fleet database, so it cannot hold a plan.";
    case "SCHEMA_NOT_MIGRATED":
      return "The server is missing a database migration (20260916_enterprise_tier). Apply it and try again.";
    case "TENANT_SUBSCRIPTION_NOT_FOUND":
      return "This tenant has no subscription record yet.";
    default:
      return err?.body?.message ?? err?.message ?? "Could not save the plan.";
  }
}

/** Resumen de una línea para la tabla: "Enterprise · 3 plugins · MDM ×300". */
export function planSummary(row) {
  if (!row?.tier) return "—";
  const parts = [tierLabel(row.tier)];
  if (row.tier === MANAGED_TIER) {
    const n = Array.isArray(row.pluginKeys) ? row.pluginKeys.length : 0;
    parts.push(n === 0 ? "no plugins chosen" : `${n} plugin${n === 1 ? "" : "s"}`);
  }
  if (row.mdmTier) parts.push(`MDM ×${row.mdmQuantity ?? 0}`);
  return parts.join(" · ");
}

export { MANAGED_TIER, PACKAGE_TIERS, TIERS };
