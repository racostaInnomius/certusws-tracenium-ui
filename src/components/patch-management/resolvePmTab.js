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

/**
 * @param fromUrl   raw ?pmTab= value
 * @param tabKeys   keys currently in the tab bar
 * @param fallbacks { defaultTab, defaultSection }
 */
export function resolvePmTab(fromUrl, tabKeys, { defaultTab, defaultSection }) {
  const raw = typeof fromUrl === "string" ? fromUrl.trim() : "";

  const movedTo = MOVED_TO_SETTINGS[raw];
  if (movedTo) return { tab: SETTINGS_TAB, configSection: movedTo };

  if (tabKeys.includes(raw)) {
    return { tab: raw, configSection: defaultSection };
  }
  return { tab: defaultTab, configSection: defaultSection };
}

/**
 * The value to write back to the URL.
 *
 * Configure writes its SECTION rather than the tab key, so a link to one
 * setting stays one link instead of "open Configure, then click the third
 * item". The default tab writes nothing, keeping the bare URL clean.
 */
export function pmTabSearchValue(tab, configSection, defaultTab) {
  if (tab === SETTINGS_TAB) return configSection;
  return tab === defaultTab ? "" : tab;
}
