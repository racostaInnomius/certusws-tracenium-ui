import * as React from "react";
import { httpGetJson, isAuthError, setApiCacheSessionScope } from "../api/http";
import { setCachedFetchSessionScope } from "../hooks/useCachedFetch";

type AuthValue = {
  auth: any;
  loading: boolean;
  refreshAuth: (bootstrapPayload?: any) => Promise<any>;
};

const AuthContext = React.createContext<AuthValue | null>(null);

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstDefined(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function firstNonEmptyText(...values: any[]) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeBoolean(value: any, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "active"].includes(text)) return true;
  if (["false", "0", "no", "n", "inactive", "disabled"].includes(text)) return false;

  return fallback;
}

function pickFirstObject(...values: any[]) {
  for (const value of values) {
    if (isObject(value)) return value;
  }
  return null;
}

function normalizeTenantMember(data: any, user: any) {
  const rawTenantMember = pickFirstObject(
    data?.tenantMember,
    data?.tenant_member,
    data?.member,
    data?.membership,
    user?.tenantMember,
    user?.tenant_member,
    user?.member,
    user?.membership,
    data?.auth?.tenantMember,
    data?.auth?.tenant_member,
    data?.principal?.tenantMember,
    data?.principal?.tenant_member
  );

  const role = firstNonEmptyText(
    rawTenantMember?.role,
    rawTenantMember?.traceniumRole,
    rawTenantMember?.tracenium_role,
    data?.traceniumRole,
    data?.tracenium_role,
    user?.traceniumRole,
    user?.tracenium_role,
    data?.role,
    user?.role
  ).toUpperCase();

  const tenantId = firstDefined(
    rawTenantMember?.tenantId,
    rawTenantMember?.tenant_id,
    data?.tenantId,
    data?.tenant_id,
    data?.tenant?.id,
    user?.tenantId,
    user?.tenant_id,
    user?.tenant?.id
  );

  const activeCandidate = firstDefined(
    rawTenantMember?.isActive,
    rawTenantMember?.is_active,
    rawTenantMember?.active,
    rawTenantMember?.enabled,
    data?.tenantMemberIsActive,
    data?.tenant_member_is_active,
    user?.tenantMemberIsActive,
    user?.tenant_member_is_active
  );

  // If bootstrap already passed the backend access gate and exposes a tenant
  // role but omits the active flag, treat the member as active for UI gating.
  // Explicit false still wins.
  const isActive = normalizeBoolean(activeCandidate, Boolean(role));

  if (!rawTenantMember && !role && tenantId === undefined) return null;

  return {
    ...(rawTenantMember || {}),
    ...(role ? { role } : {}),
    isActive,
    ...(tenantId !== undefined ? { tenantId, tenant_id: tenantId } : {}),
  };
}

function normalizeBootstrapAuth(data: any) {
  if (!isObject(data)) return data ?? null;

  const user =
    (isObject(data.user) && data.user) ||
    (isObject(data.auth) && data.auth) ||
    (isObject(data.principal) && data.principal) ||
    null;

  const tenantMember = normalizeTenantMember(data, user);

  const tenant = pickFirstObject(
    data.tenant,
    data.currentTenant,
    data.current_tenant,
    user?.tenant,
    user?.currentTenant,
    user?.current_tenant,
    tenantMember?.tenant
  );

  const tenantId = firstDefined(
    data.tenantId,
    data.tenant_id,
    tenant?.id,
    tenantMember?.tenantId,
    tenantMember?.tenant_id,
    user?.tenantId,
    user?.tenant_id
  );

  const tenantName = firstNonEmptyText(
    data.tenantName,
    data.tenant_name,
    data.tenantDisplayName,
    data.tenant_display_name,
    tenant?.name,
    tenant?.displayName,
    tenant?.display_name,
    user?.tenantName,
    user?.tenant_name
  );

  // Keep the full bootstrap payload available because different backend
  // versions expose IDP claims in different places. Flattening the user
  // object on top also keeps legacy consumers that read auth.email / auth.role
  // working without needing every component to know the full bootstrap shape.
  return {
    ...data,
    ...(user || {}),
    ...(tenant ? { tenant, currentTenant: tenant } : {}),
    ...(tenantMember ? { tenantMember, tenant_member: tenantMember } : {}),
    ...(tenantId !== undefined ? { tenantId, tenant_id: tenantId } : {}),
    ...(tenantName ? { tenantName, tenant_name: tenantName } : {}),
    user: user || data.user || null,
    bootstrap: data,
  };
}

function buildSessionCacheScope(auth: any) {
  if (!isObject(auth)) return "signed-out";

  const tenantMember = isObject(auth.tenantMember)
    ? auth.tenantMember
    : isObject(auth.tenant_member)
      ? auth.tenant_member
      : null;

  const subject = firstNonEmptyText(
    auth.subject,
    auth.sub,
    auth.user?.subject,
    auth.user?.sub,
    auth.bootstrap?.subject,
    auth.bootstrap?.sub
  );

  const email = firstNonEmptyText(
    auth.email,
    auth.user?.email,
    tenantMember?.email,
    auth.bootstrap?.email,
    auth.bootstrap?.tenantMember?.email,
    auth.bootstrap?.tenant_member?.email
  ).toLowerCase();

  // IDENTITY only — deliberately NOT the tenant.
  //
  // A scope change means "a different principal is using this browser", and
  // the handler reacts by wiping the caches AND the selected tenant. Keying
  // on the tenant made switching tenants (or a vendor selecting one) look
  // like a sign-in by someone else, so the selection was cleared out from
  // under the user and every later request went out tenant-less.
  //
  // Tenant isolation of cached data does NOT depend on this: both cache
  // layers already namespace entries as `scope::activeTenant::url` (see
  // buildCacheKey in api/http.js and buildScopedCacheKey in
  // hooks/useCachedFetch.js). Subject + email still change on a real user
  // switch, which is what the wipe is there to catch.
  return [
    subject || "no-subject",
    email || "no-email",
  ].join(":");
}

function applySessionCacheScope(auth: any) {
  const scope = buildSessionCacheScope(auth);
  setApiCacheSessionScope(scope);
  setCachedFetchSessionScope(scope);
  return scope;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const refreshAuth = React.useCallback(async (bootstrapPayload?: any) => {
    const data =
      bootstrapPayload !== undefined
        ? bootstrapPayload
        : await httpGetJson("/api/bootstrap", {
            cache: "no-store",
            timeoutMs: 12000,
            notifyOnTemporaryError: false,
          });

    const normalized = normalizeBootstrapAuth(data);
    applySessionCacheScope(normalized);
    setAuth(normalized);
    return normalized;
  }, []);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const normalized = await refreshAuth();
        if (!alive) return;
        setAuth(normalized);
      } catch (e: any) {
        // http.js already emits the global auth-required event and redirects
        // for 401 / UNAUTHENTICATED. Do not convert that into a local-only
        // silent auth state that would leave the user in the protected shell.
        if (!isAuthError(e)) {
          console.error("Auth load failed", e);
        }

        if (!alive) return;
        applySessionCacheScope(null);
        setAuth(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [refreshAuth]);

  const value = React.useMemo(
    () => ({ auth, loading, refreshAuth }),
    [auth, loading, refreshAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error("useAuthContext must be used inside AuthProvider");
  }

  return context;
}
