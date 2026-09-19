// src/components/patch-management/securityDomains.test.js
//
// Phase 1 measured that 636 of 984 open findings were unreachable because each
// tab named one category and nothing owned the remainder. Phase 3 collapsed
// four of those tabs into one filtered surface — and, while doing it, took
// `patching` out of that surface's scope on the grounds that OS updates are
// their own domain.
//
// That is a defensible split and it immediately re-created the original bug:
// `patching` is 213 open rows and holds cross.vulnerability.no_kev, and the
// Patches tab rendered a static action catalog that queries no findings at
// all. The KEV checks went straight back to being invisible.
//
// So the invariant is pinned here rather than trusted: every category is
// claimed by some surface, and the ones deliberately excluded from Security
// configuration are excluded *because another surface renders them*.

import { describe, it, expect } from "vitest";
import {
  SECURITY_DOMAINS,
  DEFAULT_DOMAIN,
  PATCHING_CATEGORY,
  domainParams,
  LEGACY_TAB_TO_DOMAIN,
} from "./securityDomains";

/** Every category with open findings in production, measured 2026-08-26. */
const LIVE_CATEGORIES = [
  "firewall",
  "patching",
  "crypto",
  "identity_policy",
  "disk_encryption",
  "network_sharing",
  "network_hardening",
  "filesystem_hardening",
  "integrity",
  "antimalware",
  "cryptography",
  // 20260914_compliance_browser_stig.sql
  "browser_hardening",
];

/** Categories rendered by a surface other than Security configuration. */
const CLAIMED_ELSEWHERE = {
  [PATCHING_CATEGORY]: "the Patches tab renders these as findings",
};

/** Does this domain's params show `category`, given the filter shape? */
function domainShows(params, category) {
  if (params.category) {
    return params.category.split(",").map((c) => c.trim()).includes(category);
  }
  if (params.categoriesNotIn) {
    return !params.categoriesNotIn.split(",").map((c) => c.trim()).includes(category);
  }
  return true;
}

describe("the default shows everything", () => {
  it("narrows nothing except what another surface owns", () => {
    // The inversion phase 3 is built on: the old default was one slice with
    // the rest invisible.
    const params = domainParams(DEFAULT_DOMAIN);
    const excluded = (params.categoriesNotIn ?? "").split(",").filter(Boolean);
    for (const category of excluded) {
      expect(
        CLAIMED_ELSEWHERE[category],
        `${category} is excluded but nothing else renders it`
      ).toBeTruthy();
    }
  });

  it("covers every live category that is not claimed elsewhere", () => {
    const params = domainParams(DEFAULT_DOMAIN);
    for (const category of LIVE_CATEGORIES) {
      if (CLAIMED_ELSEWHERE[category]) continue;
      expect(domainShows(params, category), `${category} missing from the default`).toBe(true);
    }
  });

  it("leaves no live category without a surface", () => {
    // The phase 1 invariant, restated after the reorganisation.
    const params = domainParams(DEFAULT_DOMAIN);
    for (const category of LIVE_CATEGORIES) {
      const reachable = domainShows(params, category) || Boolean(CLAIMED_ELSEWHERE[category]);
      expect(reachable, `${category} is unreachable from anywhere`).toBe(true);
    }
  });

  it("does not silently swallow the KEV checks", () => {
    // The specific regression: `patching` may only leave Security
    // configuration because the Patches tab took it, never by omission.
    expect(domainShows(domainParams(DEFAULT_DOMAIN), PATCHING_CATEGORY)).toBe(false);
    expect(CLAIMED_ELSEWHERE[PATCHING_CATEGORY]).toBeTruthy();
  });
});

describe("the narrowing slices", () => {
  it("every legacy tab maps to a slice that exists", () => {
    for (const [tab, domain] of Object.entries(LEGACY_TAB_TO_DOMAIN)) {
      expect(
        SECURITY_DOMAINS.some((d) => d.key === domain),
        `${tab} maps to "${domain}", which is not a slice`
      ).toBe(true);
    }
  });

  it("no slice reaches into another domain's patches", () => {
    for (const d of SECURITY_DOMAINS) {
      expect(domainShows(d.params, PATCHING_CATEGORY), `${d.key} shows patching`).toBe(false);
    }
  });

  it("browser policies have their own slice and no other slice claims them", () => {
    const browsers = domainParams("browsers");
    expect(domainShows(browsers, "browser_hardening")).toBe(true);
    expect(domainShows(browsers, "firewall")).toBe(false);
    for (const d of SECURITY_DOMAINS) {
      if (d.key === "browsers" || d.key === DEFAULT_DOMAIN) continue;
      expect(domainShows(d.params, "browser_hardening"), `${d.key} también los muestra`).toBe(false);
    }
  });

  it("falls back to everything for an unknown slice", () => {
    // A stale URL should show more than it asked for, never less.
    expect(domainParams("nonsense")).toEqual(domainParams(DEFAULT_DOMAIN));
    expect(domainParams(undefined)).toEqual(domainParams(DEFAULT_DOMAIN));
  });

  it("gives every slice a label and a hint", () => {
    for (const d of SECURITY_DOMAINS) {
      expect(d.label?.trim(), `${d.key} has no label`).toBeTruthy();
      expect(d.hint?.trim(), `${d.key} has no hint`).toBeTruthy();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Fuera el cajón de sastre (18-sep).
//
// «Everything else» era el complemento de las rebanadas con nombre. Su trabajo
// —que ninguna categoría quedase sin superficie— ya lo hace «Everything», que
// es el por defecto; lo único que aportaba de más era esconder BitLocker, el
// cortafuegos y tres dominios más detrás de una etiqueta que no los nombra.
describe("ningún dominio se esconde tras un «resto»", () => {
  it("⭐ no queda ninguna rebanada definida SOLO por exclusión, salvo el default", () => {
    for (const d of SECURITY_DOMAINS) {
      if (d.key === DEFAULT_DOMAIN) continue;
      expect(d.params.category, `${d.key} se define por lo que NO es`).toBeTruthy();
    }
  });

  it("⭐ cada categoría viva tiene un dominio CON NOMBRE, o la pinta otra superficie", () => {
    // Más fuerte que «es alcanzable»: alcanzable lo era también desde el cajón.
    for (const category of LIVE_CATEGORIES) {
      if (CLAIMED_ELSEWHERE[category]) continue;
      // «Con nombre» = definido por lo que ES (`category`), no por lo que no
      // es: un cajón de sastre también «mostraba» la categoría.
      const named = SECURITY_DOMAINS.filter(
        (d) => d.key !== DEFAULT_DOMAIN && d.params.category && domainShows(d.params, category)
      );
      expect(named.length, `${category} no tiene dominio propio`).toBeGreaterThan(0);
    }
  });

  it("los dominios con nombre no se solapan entre sí", () => {
    // Un hallazgo en dos pestañas se cuenta dos veces en la tira de severidad.
    for (const category of LIVE_CATEGORIES) {
      if (CLAIMED_ELSEWHERE[category]) continue;
      const claimants = SECURITY_DOMAINS.filter(
        (d) => d.key !== DEFAULT_DOMAIN && d.params.category && domainShows(d.params, category) && !d.params.checkIdContains
      );
      expect(claimants.length, `${category} lo reclaman ${claimants.map((d) => d.key).join(", ")}`).toBeLessThanOrEqual(1);
    }
  });

  it("un enlace viejo al cajón de sastre enseña de más, nunca de menos", () => {
    expect(LEGACY_TAB_TO_DOMAIN.other).toBe(DEFAULT_DOMAIN);
    expect(LEGACY_TAB_TO_DOMAIN.rest).toBe(DEFAULT_DOMAIN);
  });

  it("BitLocker y el cortafuegos dejan de vivir en un «resto»", () => {
    // El caso concreto de la captura: los dos controles más citados de una
    // auditoría aparecían bajo una etiqueta que no los nombra.
    expect(domainShows(domainParams("disk"), "disk_encryption")).toBe(true);
    expect(domainShows(domainParams("firewall"), "firewall")).toBe(true);
    expect(SECURITY_DOMAINS.some((d) => /else|other|rest/i.test(d.label))).toBe(false);
  });
});
