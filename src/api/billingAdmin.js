// src/api/billingAdmin.js
//
// Superficie de STAFF de facturación (backend billing.routes.ts, router
// `staff`, requireGlobalAdmin).

import { httpPutJson } from "./http";

const BASE = "/api/v1/billing/admin";

/**
 * Fija el plan de un tenant: tier, licencias, trial, plugins (Enterprise) y
 * MDM. Es un REEMPLAZO completo — construir el cuerpo con
 * `staffPlanModel.planPayload`.
 */
export async function setTenantPlan(tenantId, body) {
  return httpPutJson(`${BASE}/subscriptions/${encodeURIComponent(tenantId)}`, body);
}
