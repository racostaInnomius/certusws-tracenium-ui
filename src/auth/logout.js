// src/auth/logout.js
//
// Single source of truth for signing out. Clears both client caches, flips
// the cache session scope to "signed-out" (so nothing from the previous
// identity is ever served), then hits the backend logout to obtain the
// OIDC end-session URL and redirects there. Used by the Sidebar (client
// shell) and the Topbar (always visible, incl. the MSP portfolio).

import { clearApiCache, setApiCacheSessionScope } from "../api/http";
import { clearCachedFetch, setCachedFetchSessionScope } from "../hooks/useCachedFetch";

const FALLBACK_LOGOUT_URL = "https://api.sso.safecertus.com/logout";

export async function performLogout() {
  clearApiCache();
  clearCachedFetch();
  setApiCacheSessionScope("signed-out");
  setCachedFetchSessionScope("signed-out");

  let logoutUrl = FALLBACK_LOGOUT_URL;
  try {
    const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/logout`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.logoutUrl) logoutUrl = data.logoutUrl;
    }
  } catch (e) {
    console.error("Logout failed", e);
  } finally {
    window.location.href = logoutUrl;
  }
}
