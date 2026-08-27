// src/components/patch-management/resolvePmTab.test.js
//
// Phase 2 of the console refactor moved Maintenance and the vCenter gateway
// out of the tab bar and into Configure, and pulled the two catalogs out of
// the tabs that were hiding them behind a toggle.
//
// Every one of those had a URL. The Security Compliance drawer links here with
// ?pmTab= to send an operator straight to a finding, and people bookmark the
// gateway page. A reorganisation that dropped them on the default tab would be
// its own small betrayal — silent, and only noticed by the person who trusted
// the link.

import { describe, it, expect } from "vitest";
import {
  resolvePmTab,
  pmTabSearchValue,
  MOVED_TO_SETTINGS,
  MOVED_TO_SECURITY,
  SETTINGS_TAB,
  SECURITY_TAB,
} from "./resolvePmTab";

/** The bar after phase 3. */
const TAB_KEYS = [
  "patches",
  "security",
  "third-party",
  "vulnerabilities",
  "settings",
];

const FALLBACKS = {
  defaultTab: "patches",
  defaultSection: "maintenance",
  defaultDomain: "all",
};

describe("links that existed before the move", () => {
  it.each(Object.keys(MOVED_TO_SETTINGS))("?pmTab=%s still lands on its section", (key) => {
    const { tab, configSection } = resolvePmTab(key, TAB_KEYS, FALLBACKS);
    expect(tab).toBe(SETTINGS_TAB);
    expect(configSection).toBe(MOVED_TO_SETTINGS[key]);
  });

  it("does not drop a moved link on the default tab", () => {
    // The failure this guards against is silent: the page opens, just not
    // where the link promised.
    expect(resolvePmTab("gateway", TAB_KEYS, FALLBACKS).tab).not.toBe(FALLBACKS.defaultTab);
  });
});

describe("links that did not move", () => {
  it.each(TAB_KEYS)("?pmTab=%s opens that tab", (key) => {
    expect(resolvePmTab(key, TAB_KEYS, FALLBACKS).tab).toBe(key);
  });

  it("keeps the Security Compliance deep link to the KEV findings working", () => {
    // SCP's cross.vulnerability.* drawer links here so "go see the KEVs" is
    // one click.
    expect(resolvePmTab("vulnerabilities", TAB_KEYS, FALLBACKS).tab).toBe("vulnerabilities");
  });
});

describe("anything else", () => {
  it.each(["", "   ", "nonsense", null, undefined, 42])(
    "%s falls back to the default tab",
    (raw) => {
      const { tab, configSection } = resolvePmTab(raw, TAB_KEYS, FALLBACKS);
      expect(tab).toBe(FALLBACKS.defaultTab);
      expect(configSection).toBe(FALLBACKS.defaultSection);
    }
  );

  it("tolerates whitespace around a real key", () => {
    expect(resolvePmTab("  gateway  ", TAB_KEYS, FALLBACKS).tab).toBe(SETTINGS_TAB);
  });
});

describe("what goes back into the URL", () => {
  it("writes the section, not the tab, while in Configure", () => {
    // So a link to one setting stays one link rather than "open Configure,
    // then click the third item".
    expect(pmTabSearchValue(SETTINGS_TAB, "gateway", "patches")).toBe("gateway");
  });

  it("writes nothing for the default tab", () => {
    expect(pmTabSearchValue("patches", "maintenance", "patches")).toBe("");
  });

  it("round-trips every section back to itself", () => {
    for (const section of Object.values(MOVED_TO_SETTINGS)) {
      const written = pmTabSearchValue(SETTINGS_TAB, section, "patches");
      const back = resolvePmTab(written, TAB_KEYS, FALLBACKS);
      expect(back.tab).toBe(SETTINGS_TAB);
      expect(back.configSection).toBe(section);
    }
  });

  it("round-trips every ordinary tab back to itself", () => {
    for (const key of TAB_KEYS.filter((k) => k !== SETTINGS_TAB)) {
      const written = pmTabSearchValue(key, "maintenance", "patches");
      expect(resolvePmTab(written, TAB_KEYS, FALLBACKS).tab).toBe(key);
    }
  });
});

describe("the four findings tabs that became one surface", () => {
  it.each(Object.keys(MOVED_TO_SECURITY))("?pmTab=%s selects its slice", (key) => {
    const { tab, securityDomain } = resolvePmTab(key, TAB_KEYS, FALLBACKS);
    expect(tab).toBe(SECURITY_TAB);
    expect(securityDomain).toBe(MOVED_TO_SECURITY[key]);
  });

  it("keeps every old findings link off the default tab", () => {
    // Four tabs collapsed into one; landing on Patches instead would look
    // like the link simply stopped working.
    for (const key of Object.keys(MOVED_TO_SECURITY)) {
      expect(resolvePmTab(key, TAB_KEYS, FALLBACKS).tab).not.toBe(FALLBACKS.defaultTab);
    }
  });

  it("opens the surface showing everything when no slice is named", () => {
    // The inversion that matters: the default is now the whole picture, not
    // one slice with the rest invisible.
    expect(resolvePmTab("security", TAB_KEYS, FALLBACKS).securityDomain).toBe("all");
  });

  it("round-trips every slice through the URL", () => {
    for (const key of Object.keys(MOVED_TO_SECURITY)) {
      const domain = MOVED_TO_SECURITY[key];
      const written = pmTabSearchValue(SECURITY_TAB, "maintenance", "patches", domain, "all");
      const back = resolvePmTab(written, TAB_KEYS, FALLBACKS);
      expect(back.tab).toBe(SECURITY_TAB);
      expect(back.securityDomain).toBe(domain);
    }
  });

  it("writes the bare tab key for the everything slice", () => {
    // ?pmTab=security is the honest URL for "show me everything", and it
    // survives a rename of the default slice.
    expect(pmTabSearchValue(SECURITY_TAB, "maintenance", "patches", "all", "all")).toBe(SECURITY_TAB);
    expect(pmTabSearchValue(SECURITY_TAB, "maintenance", "patches", undefined, "all")).toBe(SECURITY_TAB);
  });

  it("does not confuse a settings link with a security one", () => {
    expect(resolvePmTab("gateway", TAB_KEYS, FALLBACKS).tab).toBe(SETTINGS_TAB);
    expect(resolvePmTab("tls", TAB_KEYS, FALLBACKS).tab).toBe(SECURITY_TAB);
  });
});
