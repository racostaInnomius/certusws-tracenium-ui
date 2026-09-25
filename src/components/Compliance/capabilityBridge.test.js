// src/components/Compliance/capabilityBridge.test.js
//
// The bridge is the vocabulary contract between Baselines (capability
// keys) and Posture (catalog categories). These tests pin the mapping
// against the catalog seeds AND the mode-resolution semantics — if a
// category gets renamed backend-side, the first describe is what should
// go red.

import { describe, it, expect } from "vitest";
import {
  CAPABILITY_TO_CATEGORIES,
  capabilitiesForCategory,
  categoriesForCapability,
  resolveMode,
  baselineModeForCategory,
  capabilitiesForFinding,
  baselineModeForFinding,
} from "./capabilityBridge";
import { SECURITY_CAPABILITIES } from "../Policies/policyTransforms";

describe("map integrity", () => {
  it("covers every SECURITY_CAPABILITIES key (no orphan capabilities)", () => {
    for (const cap of SECURITY_CAPABILITIES) {
      expect(CAPABILITY_TO_CATEGORIES, `missing map entry for ${cap.key}`).toHaveProperty(cap.key);
    }
  });

  it("contains no keys that are not real capabilities", () => {
    const known = new Set(SECURITY_CAPABILITIES.map((c) => c.key));
    for (const key of Object.keys(CAPABILITY_TO_CATEGORIES)) {
      expect(known.has(key), `unknown capability ${key}`).toBe(true);
    }
  });

  it("maps the catalog's category names (grounded spot-checks)", () => {
    expect(categoriesForCapability("firewall")).toEqual(["firewall"]);
    expect(categoriesForCapability("tls")).toContain("cryptography");
    expect(categoriesForCapability("ssh")).toEqual(
      expect.arrayContaining(["identity_policy", "cryptography"])
    );
    expect(categoriesForCapability("filevault")).toEqual(["disk_encryption"]);
    expect(categoriesForCapability("usb")).toEqual([]);
  });

  it("reverse lookup returns full capability entries", () => {
    const caps = capabilitiesForCategory("network_sharing").map((c) => c.key);
    expect(caps).toEqual(expect.arrayContaining(["smb", "remoteLogin", "shares"]));
    expect(capabilitiesForCategory("no_such_category")).toEqual([]);
  });
});

describe("resolveMode", () => {
  it("null mode inherits defaultMode, then falls back to report-only", () => {
    expect(resolveMode({ mode: null }, "auto")).toBe("auto");
    expect(resolveMode({ mode: null }, undefined)).toBe("report-only");
    expect(resolveMode(undefined, "off")).toBe("off");
    expect(resolveMode({ mode: "auto" }, "off")).toBe("auto");
  });
});

function formWith(modes, defaultMode) {
  const capabilities = {};
  for (const [key, mode] of Object.entries(modes)) {
    capabilities[key] = { mode, values: {} };
  }
  return { defaultMode, capabilities };
}

describe("baselineModeForCategory", () => {
  it("returns null for unmapped categories (no chip rendered)", () => {
    expect(baselineModeForCategory(formWith({}), "antimalware")).toBeNull();
  });

  it("summarizes 'auto' only when EVERY enforceable capability is auto", () => {
    const info = baselineModeForCategory(formWith({ firewall: "auto" }), "firewall");
    expect(info.mode).toBe("auto");
    expect(info.autoUpgradable).toEqual([]);
  });

  it("defaults to report-only and lists enforceable caps as upgradable", () => {
    const info = baselineModeForCategory(formWith({}), "firewall");
    expect(info.mode).toBe("report-only");
    expect(info.autoUpgradable.map((c) => c.key)).toEqual(["firewall"]);
  });

  it("'off' only when every mapped capability is off", () => {
    // network_sharing maps smb + remoteLogin + shares.
    const allOff = formWith({ smb: "off", remoteLogin: "off", shares: "off" });
    expect(baselineModeForCategory(allOff, "network_sharing").mode).toBe("off");
    const mixed = formWith({ smb: "off", remoteLogin: "report-only", shares: "off" });
    expect(baselineModeForCategory(mixed, "network_sharing").mode).toBe("report-only");
  });

  it("non-enforceable capabilities never appear in autoUpgradable", () => {
    // disk_encryption maps filevault + bitlocker, both enforcer:false.
    const info = baselineModeForCategory(formWith({}), "disk_encryption");
    expect(info).not.toBeNull();
    expect(info.autoUpgradable).toEqual([]);
  });
});

// Recorrido de prod, 25-sep: el Secure Boot de W11_JPR_LAB (Windows,
// categoría `integrity`) decía «Gatekeeper can remediate this automatically».
describe("capabilitiesForFinding", () => {
  const SECURE_BOOT = { checkId: "windows.secureboot.enabled", category: "integrity" };
  const GATEKEEPER = { checkId: "macos.gatekeeper.enabled", category: "integrity" };
  const ROOT_CAS = { checkId: "cdp.no_nonstandard_root_cas", category: "cryptography" };
  const LEGACY_TLS = { checkId: "windows.crypto.legacy_tls_disabled", category: "cryptography" };
  const CHECKS = {
    gatekeeper: ["macos.gatekeeper.enabled"],
    sip: ["macos.sip.enabled"],
    tls: ["windows.crypto.legacy_tls_disabled", "windows.crypto.weak_ciphers_disabled"],
  };
  const catalogChecksFor = (key) => CHECKS[key] ?? [];

  it("⭐ con la matriz, un hallazgo es de la capability que gobierna SU check", () => {
    expect(capabilitiesForFinding(SECURE_BOOT, { platform: "windows", catalogChecksFor })).toEqual([]);
    expect(capabilitiesForFinding(GATEKEEPER, { platform: "macos", catalogChecksFor }).map((c) => c.key)).toEqual(["gatekeeper"]);
    // Una CA raíz rara no la arregla deshabilitar TLS 1.0, aunque compartan categoría.
    expect(capabilitiesForFinding(ROOT_CAS, { platform: "windows", catalogChecksFor })).toEqual([]);
    expect(capabilitiesForFinding(LEGACY_TLS, { platform: "windows", catalogChecksFor }).map((c) => c.key)).toEqual(["tls"]);
  });

  it("sin la matriz, nunca una capability de otro sistema operativo", () => {
    expect(capabilitiesForFinding(SECURE_BOOT, { platform: "windows" })).toEqual([]);
    expect(capabilitiesForFinding(GATEKEEPER, { platform: "macos" }).map((c) => c.key)).toEqual(
      expect.arrayContaining(["gatekeeper", "sip"])
    );
  });

  it("una matriz a medias (backend anterior sin catalogChecks) cae al plan B, no a «nada»", () => {
    const partial = (key) => (key === "tls" ? CHECKS.tls : null);
    expect(capabilitiesForFinding(LEGACY_TLS, { platform: "windows", catalogChecksFor: partial }).map((c) => c.key)).toEqual(["tls"]);
  });

  it("baselineModeForFinding: sin capability no hay pista", () => {
    expect(baselineModeForFinding(formWith({}), SECURE_BOOT, { platform: "windows", catalogChecksFor })).toBeNull();
    const info = baselineModeForFinding(formWith({}), LEGACY_TLS, { platform: "windows", catalogChecksFor });
    expect(info.mode).toBe("report-only");
    expect(info.autoUpgradable.map((c) => c.key)).toEqual(["tls"]);
  });
});
