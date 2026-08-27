// src/components/patch-management/resolvePmTab.js
//
// Resolves the ?pmTab= deep link into the tab to open and, when that tab is
// Configure, which section inside it.
//
// Maintenance and the vCenter gateway used to be top-level tabs. Moving them
// under Configure would have quietly broken every existing link and bookmark —
// including the one the Security Compliance drawer uses to send an operator
// straight to the KEV findings — so the old keys keep resolving, now to the
// section they became.
//
// Pure and separate from the page so this stays testable: the page itself
// pulls in auth context and live fetches.

/** Tabs that became sections of Configure, mapped to the section they are now. */
export const MOVED_TO_SETTINGS = {
  maintenance: "maintenance",
  gateway: "gateway",
  "third-party-catalog": "third-party-catalog",
  "cve-catalog": "cve-catalog",
};

export const SETTINGS_TAB = "settings";
export const SECURITY_TAB = "security";

/**
 * Tabs that became slices of the Security configuration surface.
 *
 * `?pmTab=tls` was a real link; it now selects the encryption slice of one
 * page rather than opening a tab that no longer exists.
 */
export const MOVED_TO_SECURITY = {
  tls: "crypto",
  smb: "smb",
  shares: "shares",
  other: "rest",
};

/**
 * @param fromUrl   raw ?pmTab= value
 * @param tabKeys   keys currently in the tab bar
 * @param fallbacks { defaultTab, defaultSection }
 */
export function resolvePmTab(fromUrl, tabKeys, { defaultTab, defaultSection, defaultDomain }) {
  const raw = typeof fromUrl === "string" ? fromUrl.trim() : "";
  const base = { configSection: defaultSection, securityDomain: defaultDomain };

  const movedToSettings = MOVED_TO_SETTINGS[raw];
  if (movedToSettings) return { ...base, tab: SETTINGS_TAB, configSection: movedToSettings };

  const movedToSecurity = MOVED_TO_SECURITY[raw];
  if (movedToSecurity) return { ...base, tab: SECURITY_TAB, securityDomain: movedToSecurity };

  if (tabKeys.includes(raw)) return { ...base, tab: raw };
  return { ...base, tab: defaultTab };
}

/**
 * The value to write back to the URL.
 *
 * Configure writes its SECTION rather than the tab key, so a link to one
 * setting stays one link instead of "open Configure, then click the third
 * item". The default tab writes nothing, keeping the bare URL clean.
 */
export function pmTabSearchValue(tab, configSection, defaultTab, securityDomain, defaultDomain) {
  if (tab === SETTINGS_TAB) return configSection;
  if (tab === SECURITY_TAB) {
    // The default slice writes the tab key, not "all": a bare ?pmTab=security
    // is the honest URL for "show me everything", and it survives a rename of
    // the default slice.
    if (!securityDomain || securityDomain === defaultDomain) return SECURITY_TAB;
    const legacy = Object.entries(MOVED_TO_SECURITY).find(([, d]) => d === securityDomain);
    return legacy ? legacy[0] : SECURITY_TAB;
  }
  return tab === defaultTab ? "" : tab;
}
