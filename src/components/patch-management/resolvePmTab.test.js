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
  SETTINGS_TAB,
} from "./resolvePmTab";

/** The bar after phase 2. */
const TAB_KEYS = [
  "patches",
  "tls",
  "smb",
  "shares",
  "other",
  "third-party",
  "vulnerabilities",
  "settings",
];

const FALLBACKS = { defaultTab: "patches", defaultSection: "maintenance" };

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
