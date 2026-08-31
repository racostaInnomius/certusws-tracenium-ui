// src/hooks/useEffectiveTenantId.js
//
// Which tenant is this page actually looking at?
//
// THE BUG THIS EXISTS TO END
//
// There are two places a tenant can live, and pages were reading only one.
//
//   `auth.tenantId`        — comes from /api/bootstrap, and the backend fills
//                            it in ONLY when the request carries an
//                            `X-Tenant-Id` header. Measured against production:
//                            no header → `tenantId` absent and `tenantMember`
//                            null; `X-Tenant-Id: 113` → `tenantId: "113"`,
//                            full membership.
//
//   `msp.activeTenant.id`  — the tenant the operator selected in the vendor /
//                            MSP portfolio. Selecting one writes it here AND
//                            into the http layer (setActiveTenantId → the
//                            header above). It is deliberately NOT written into
//                            `auth.tenantId`.
//
// So during portfolio navigation the MSP context knows the tenant and `auth`
// does not — and seventeen pages read `auth?.tenantId`. Software Delivery made
// that visible because it gates on it: with no tenant id its effect returned
// early, never requested the policy at all (confirmed in the network log: zero
// calls to /policies/tenants/*/policy), and rendered "Software Delivery isn't
// active for this tenant". The tenant's policy had SDP enabled and its
// subscription was active the whole time. Patch Management reads the same
// field the same way.
//
// ⚠️ THE MSP SCOPE WINS, AND THE ORDER IS THE POINT.
//
// When scoped, `refreshAuth()` should eventually make `auth.tenantId` agree —
// but `enterTenant`/`exitTenant` call it fire-and-forget with `.catch(() => {})`,
// so a failed refresh leaves `auth.tenantId` stale or absent with no signal
// anywhere. Reading the MSP scope first means the page follows what the
// operator actually selected — which is also what the `X-Tenant-Id` header on
// every request is already using, so the page and its data agree.

import { useAuthContext } from "../auth/AuthContext";
import { useMspOptional } from "../msp/MspContext";

/**
 * The tenant id a page should query with, or `null` when there is genuinely
 * no tenant selected.
 *
 * ⚠️ `null` means "we do not know which tenant" — NOT "this tenant lacks
 * something". Callers that gate features must keep those two apart: reporting
 * an unknown as a denial is what sent this bug to licensing and policy data
 * that were both fine.
 */
export function useEffectiveTenantId() {
  const { auth } = useAuthContext();
  const msp = useMspOptional();

  return normalizeTenantId(msp?.activeTenant?.id) ?? normalizeTenantId(auth?.tenantId);
}

/**
 * Ids arrive as numbers from some payloads and strings from others, and they
 * end up in URL paths and cache keys where `1` and `"1"` must not be two
 * different tenants. Normalising here keeps every caller consistent.
 *
 * ⚠️ Returns null for empty/whitespace so a blank id can never be mistaken for
 * a real one — `""` is falsy but `" "` is not, and that difference decides
 * whether a page fetches the wrong thing or nothing at all.
 */
function normalizeTenantId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}
