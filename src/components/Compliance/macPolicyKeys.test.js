// src/components/Compliance/macPolicyKeys.test.js
import { describe, expect, it } from "vitest";
import { intentsInPolicy, macPolicyKeys } from "./macPolicyKeys";

const T1 = { safari: { showFullURL: true }, privacy: { allowPersonalizedAds: false }, passwordPolicy: { minLength: 15 } };

describe("macPolicyKeys", () => {
  it("las claves con el prefijo de las intenciones del catálogo", () => {
    expect([...macPolicyKeys(T1)].sort()).toEqual(["macos.passwordPolicy.minLength", "macos.privacy.allowPersonalizedAds", "macos.safari.showFullURL"]);
    expect(macPolicyKeys(null).size).toBe(0);
  });

  it("⭐ un arreglo está en la política sólo si TODAS sus claves lo están", () => {
    const keys = macPolicyKeys(T1);
    expect(intentsInPolicy([{ key: "macos.privacy.allowPersonalizedAds", value: false }], keys)).toBe(true);
    expect(intentsInPolicy([{ key: "macos.privacy.allowPersonalizedAds" }, { key: "macos.siri.allowSiri" }], keys)).toBe(false);
    expect(intentsInPolicy([], keys)).toBe(false);
    expect(intentsInPolicy([{ key: "macos.safari.showFullURL" }], null)).toBe(false);
  });
});
