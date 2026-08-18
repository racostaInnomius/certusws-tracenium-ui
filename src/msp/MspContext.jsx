// src/msp/MspContext.jsx
//
// MSP navigation state (F1). Holds the loaded portfolio + the currently
// selected client ("active tenant"). Wraps the app so both the Portfolio
// view and the tenant switcher read the same source of truth.
//
// The active tenant is the bridge between the portfolio and the existing
// single-tenant shell: selecting a client sets it here AND in the http
// layer (setActiveTenantId → X-Tenant-Id header). Clearing it returns to
// the portfolio.

import * as React from "react";
import { fetchPortfolio } from "./mspApi";
import { useAuthContext } from "../auth/AuthContext";
import {
  setActiveTenantId,
  getActiveTenantId,
  isAuthError,
  clearApiCache,
} from "../api/http";
import { clearCachedFetch } from "../hooks/useCachedFetch";

const MspContext = React.createContext(null);

const ACTIVE_META_KEY = "tr_active_tenant_meta";   // { id, name } for labels
const SWITCHABLE_KEY = "tr_switchable_clients";    // sibling clients for the switcher

function readJson(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key, val) {
  if (typeof window === "undefined") return;
  try {
    if (val) window.sessionStorage?.setItem(key, JSON.stringify(val));
    else window.sessionStorage?.removeItem(key);
  } catch {
    // best effort
  }
}

export function MspProvider({ children }) {
  const [portfolio, setPortfolio] = React.useState(null); // { level, items } | null
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // The auth context is per-TENANT, not just per-user: /api/bootstrap returns
  // the caller's membership (role, isActive), the resolved tenantId, and that
  // tenant's session settings — all of which change when the active tenant
  // changes. Nothing else re-fetches it (AuthGate only runs at mount), so
  // without this the shell keeps the bootstrap taken in portfolio mode, where
  // there IS no tenant: `auth.tenantId` stays undefined and `auth.tenantMember`
  // stays null. Pages key off both (PluginControl, Policies, Jobs,
  // SoftwareDelivery, PatchManagement, Sidebar…), so they silently render as
  // "no tenant / no permissions" — data never loads and every control is
  // disabled, even though the user really is inside a tenant as OWNER.
  const { refreshAuth } = useAuthContext();

  // Active client. Hydrated from sessionStorage so a refresh keeps the
  // operator in the same client (the http layer already restored the id;
  // we restore the {id,name} meta here for the labels).
  const [activeTenant, setActiveTenantState] = React.useState(() => {
    const id = getActiveTenantId();
    const meta = readJson(ACTIVE_META_KEY);
    if (id && meta && String(meta.id) === String(id)) return meta;
    if (id) return { id, name: null };
    return null;
  });

  // The sibling clients the active client was selected from — powers the
  // tenant switcher (jump between clients without returning to the
  // portfolio). Persisted so a refresh keeps the switcher populated.
  const [switchableClients, setSwitchableClients] = React.useState(
    () => readJson(SWITCHABLE_KEY) || []
  );

  const loadPortfolio = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetchPortfolio();
      setPortfolio({ level: resp?.level ?? "none", items: resp?.items ?? [] });
    } catch (err) {
      if (!isAuthError(err)) {
        setError(err?.message || "Could not load your portfolio.");
      }
      // On failure default to 'none' so single-tenant users (and any
      // degraded read) still get into the app via the token tenant.
      setPortfolio({ level: "none", items: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  // Select a client: sets the http header + local state + persisted meta.
  // `siblings` is the list of client items the selection came from (an
  // MSP's clients) — it powers the switcher so the operator can hop to
  // another client without going back to the portfolio.
  const enterTenant = React.useCallback((id, name, siblings) => {
    const changed = String(getActiveTenantId() ?? "") !== String(id ?? "");
    setActiveTenantId(id);
    // Switching the active tenant invalidates every cached GET — they were
    // keyed under the previous tenant context. The cache keys are now
    // tenant-scoped, but we also wipe on switch so nothing stale (or a
    // request that was in-flight during the switch) can paint the new
    // tenant with the old tenant's numbers.
    if (changed) {
      // keepInFlight: the cache keys are tenant-scoped, so nothing from
      // the previous tenant can be adopted by the new one. Wiping the
      // in-flight map only made the shell's second render (after
      // refreshAuth lands) re-issue every request the first render had
      // already sent.
      clearApiCache({ keepInFlight: true });
      clearCachedFetch();
    }
    const meta = { id: String(id), name: name ?? null };
    writeJson(ACTIVE_META_KEY, meta);
    setActiveTenantState(meta);
    if (Array.isArray(siblings)) {
      const slim = siblings.map((s) => ({ id: String(s.tenantId), name: s.name }));
      writeJson(SWITCHABLE_KEY, slim);
      setSwitchableClients(slim);
    }
    // Re-bootstrap under the tenant we just entered. Runs AFTER
    // setActiveTenantId so the request carries the new X-Tenant-Id. Not
    // awaited — navigation shouldn't block on it; the shell re-renders when
    // the fresh auth lands. A failure here must not strand the user, so it's
    // swallowed (http.js already surfaces auth/temporary errors globally).
    if (changed) {
      refreshAuth().catch(() => {});
    }
  }, [refreshAuth]);

  // Return to the portfolio: clear the active client everywhere + wipe the
  // just-viewed tenant's cached data so the portfolio (and a subsequent
  // different client) never reads it back.
  const exitTenant = React.useCallback(() => {
    const had = getActiveTenantId() != null;
    setActiveTenantId(null);
    if (had) {
      clearApiCache({ keepInFlight: true });
      clearCachedFetch();
    }
    writeJson(ACTIVE_META_KEY, null);
    setActiveTenantState(null);
    // Same reason as enterTenant: back in portfolio mode the previous
    // tenant's membership/settings no longer apply.
    if (had) {
      refreshAuth().catch(() => {});
    }
  }, [refreshAuth]);

  const value = React.useMemo(
    () => ({
      portfolio,
      loading,
      error,
      reloadPortfolio: loadPortfolio,
      activeTenant, // { id, name } | null
      switchableClients, // [{ id, name }] for the switcher
      enterTenant,
      exitTenant,
      // Convenience: does this user navigate a portfolio at all?
      hasPortfolio: !!portfolio && portfolio.level !== "none",
    }),
    [portfolio, loading, error, loadPortfolio, activeTenant, switchableClients, enterTenant, exitTenant]
  );

  return <MspContext.Provider value={value}>{children}</MspContext.Provider>;
}

export function useMsp() {
  const ctx = React.useContext(MspContext);
  if (!ctx) throw new Error("useMsp must be used inside MspProvider");
  return ctx;
}
