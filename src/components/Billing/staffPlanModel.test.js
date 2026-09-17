import { describe, it, expect } from "vitest";
import {
  dateInMonths,
  endOfDayIso,
  newPlan,
  planErrorMessage,
  planFromRow,
  planPayload,
  planSummary,
  tierDefaults,
  validatePlan,
} from "./staffPlanModel";

const NOW = new Date("2026-09-17T15:00:00Z");

const valid = (over = {}) => ({ ...newPlan(NOW), quantity: 50, ...over });

describe("valores por defecto", () => {
  it("un paquete nace con el mes de trial estándar; Enterprise, sin trial", () => {
    expect(tierDefaults("starter", NOW)).toEqual({ trialEnabled: true, trialEndsOn: "2026-10-17" });
    expect(tierDefaults("enterprise", NOW)).toEqual({ trialEnabled: false, trialEndsOn: "" });
  });

  it("la fecha del calendario se manda como el FINAL de ese día", () => {
    // "Hasta el 17 de octubre": el 17 todavía se tiene acceso.
    expect(endOfDayIso("2026-10-17")).toBe("2026-10-17T23:59:59.000Z");
    expect(endOfDayIso("17/10/2026")).toBeNull();
    expect(dateInMonths(12, NOW)).toBe("2027-09-17");
  });
});

describe("el cuerpo del PUT", () => {
  it("un paquete: sin conjunto, sin estado, trial al final del día", () => {
    expect(planPayload(valid())).toEqual({
      tier: "starter",
      quantity: 50,
      trialEndsAt: "2026-10-17T23:59:59.000Z",
      pluginKeys: null,
      mdm: { included: false },
    });
  });

  it("Enterprise: conjunto ordenado sin repetidos, estado explícito, MDM con cantidad", () => {
    const body = planPayload(
      valid({
        tier: "enterprise",
        trialEnabled: false,
        pluginKeys: ["pmp", "scp", "pmp"],
        mdmIncluded: true,
        mdmQuantity: "300",
      })
    );
    expect(body).toEqual({
      tier: "enterprise",
      quantity: 50,
      trialEndsAt: null,
      pluginKeys: ["pmp", "scp"],
      mdm: { included: true, quantity: 300 },
      status: "active",
    });
    expect(planPayload(valid({ tier: "enterprise", canceled: true })).status).toBe("canceled");
  });

  it("`trialEndsAt` y `mdm` viajan SIEMPRE, aunque valgan nada", () => {
    // El backend es un reemplazo completo: si faltaran, se rechaza (y si se
    // aceptaran, terminarían un trial o quitarían MDM sin pedirlo).
    const body = planPayload(valid({ trialEnabled: false }));
    expect(body).toHaveProperty("trialEndsAt", null);
    expect(body).toHaveProperty("mdm", { included: false });
  });
});

describe("validación", () => {
  it("un plan completo no tiene errores", () => {
    expect(validatePlan(valid(), NOW)).toEqual({});
  });

  it("licencias, fecha y MDM se piden junto al campo", () => {
    const e = validatePlan(
      valid({ quantity: "0", trialEndsOn: "", mdmIncluded: true, mdmQuantity: "" }),
      NOW
    );
    expect(Object.keys(e).sort()).toEqual(["mdmQuantity", "quantity", "trialEndsOn"]);
  });

  it("un trial de más de 12 meses no se deja mandar", () => {
    expect(validatePlan(valid({ trialEndsOn: "2027-09-18" }), NOW).trialEndsOn).toMatch(/12 months/);
    expect(validatePlan(valid({ trialEndsOn: "2027-09-17" }), NOW)).toEqual({});
  });
});

describe("desde una fila del listado", () => {
  it("conserva la fecha de un trial vencido: reenviarla no cambia nada", () => {
    const plan = planFromRow({
      tier: "business",
      quantity: 55,
      trialEndsAt: "2026-08-01T12:00:00.000Z",
      mdmTier: "professional",
      mdmQuantity: 10,
      status: "active",
      pluginKeys: null,
    });
    expect(plan).toMatchObject({
      tier: "business",
      quantity: 55,
      trialEnabled: true,
      trialEndsOn: "2026-08-01",
      mdmIncluded: true,
      mdmQuantity: 10,
      pluginKeys: [],
    });
  });

  it("sin cantidad guardada propone el tope de equipos", () => {
    expect(planFromRow({ tier: "starter", quantity: null, maxDevices: 25 }).quantity).toBe(25);
  });
});

describe("mensajes y resumen", () => {
  it("un 409 dice qué paso falta, no 'error al guardar'", () => {
    expect(planErrorMessage({ status: 409, body: { error: "CANCEL_STRIPE_FIRST" } })).toMatch(/Cancel that subscription/);
    expect(planErrorMessage({ status: 503, body: { error: "SCHEMA_NOT_MIGRATED" } })).toMatch(/20260916_enterprise_tier/);
    expect(planErrorMessage({ message: "boom" })).toBe("boom");
  });

  it("resume el plan en una línea", () => {
    expect(planSummary({ tier: "enterprise", pluginKeys: ["pmp", "scp", "asp"], mdmTier: "professional", mdmQuantity: 300 })).toBe(
      "Enterprise · 3 plugins · MDM ×300"
    );
    expect(planSummary({ tier: "enterprise", pluginKeys: [] })).toBe("Enterprise · no plugins chosen");
    expect(planSummary({ tier: "business" })).toBe("Business");
    expect(planSummary({ tier: null })).toBe("—");
  });
});
