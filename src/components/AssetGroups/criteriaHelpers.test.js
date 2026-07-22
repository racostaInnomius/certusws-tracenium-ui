import { describe, it, expect } from "vitest";
import {
  normalizeOptionLabel,
  normalizeCatalogOption,
  normalizeCriteriaKey,
  normalizePlatformCriteriaValue,
  normalizeSuggestionValue,
  normalizeSuggestionOption,
  getCatalogOptions,
  getSuggestionFieldKey,
  isIpSubnetOperator,
  operatorExpectsArray,
  parseCommaSeparatedValues,
  operatorAllowsPartialText,
  shouldUseRemoteAutocomplete,
  isCatalogLikeField,
  getLocalFallbackOptions,
  getPlaceholder,
  getHelperText,
  PLATFORM_FALLBACK_OPTIONS,
  PLUGIN_ENABLED_OPTIONS,
} from "./criteriaHelpers";

describe("normalizeOptionLabel", () => {
  it("title-cases and collapses separators", () => {
    expect(normalizeOptionLabel("windows_server")).toBe("Windows Server");
    expect(normalizeOptionLabel("  agent-version ")).toBe("Agent Version");
    expect(normalizeOptionLabel(null)).toBe("");
  });
});

describe("normalizeCriteriaKey", () => {
  it("lowercases and underscore-separates alphanumerics", () => {
    expect(normalizeCriteriaKey("OS Platform")).toBe("os_platform");
    expect(normalizeCriteriaKey("policy-version!")).toBe("policy_version");
    expect(normalizeCriteriaKey(null)).toBe("");
  });
});

describe("normalizeCatalogOption", () => {
  it("wraps a bare string", () => {
    expect(normalizeCatalogOption("linux")).toEqual({
      label: "Linux",
      value: "linux",
      description: "Available value",
    });
  });
  it("reads value/label/description from an object, falling back across keys", () => {
    expect(normalizeCatalogOption({ key: "win", label: "Windows", subtitle: "desktop" })).toEqual({
      label: "Windows",
      value: "win",
      description: "desktop",
    });
  });
  it("returns null for empty/absent values", () => {
    expect(normalizeCatalogOption(null)).toBeNull();
    expect(normalizeCatalogOption("   ")).toBeNull();
    expect(normalizeCatalogOption({ value: "" })).toBeNull();
  });
});

describe("normalizePlatformCriteriaValue", () => {
  it("maps aliases to canonical platform values", () => {
    expect(normalizePlatformCriteriaValue("darwin")).toBe("macos");
    expect(normalizePlatformCriteriaValue("win-server")).toBe("windows-server");
    expect(normalizePlatformCriteriaValue("ubuntu")).toBe("linux");
  });
  it("passes through unknown values and empties", () => {
    expect(normalizePlatformCriteriaValue("solaris")).toBe("solaris");
    expect(normalizePlatformCriteriaValue("")).toBe("");
  });
});

describe("normalizeSuggestionValue", () => {
  it("normalizes platform values but trims others", () => {
    expect(normalizeSuggestionValue("platform", "darwin")).toBe("macos");
    expect(normalizeSuggestionValue("hostname", "  host-1 ")).toBe("host-1");
  });
});

describe("normalizeSuggestionOption", () => {
  it("applies the canonical platform label", () => {
    expect(normalizeSuggestionOption("darwin", "platform")).toMatchObject({
      value: "macos",
      label: "macOS",
    });
  });
  it("returns null when the normalized value is empty", () => {
    expect(normalizeSuggestionOption("   ", "hostname")).toBeNull();
  });
});

describe("getCatalogOptions", () => {
  it("reads options across the fieldSpec shape keys and normalizes them", () => {
    const opts = getCatalogOptions({ values: ["darwin", "win"] }, "platform");
    expect(opts.map((o) => o.value)).toEqual(["macos", "windows"]);
  });
  it("tolerates missing/invalid option arrays", () => {
    expect(getCatalogOptions({}, "hostname")).toEqual([]);
    expect(getCatalogOptions({ options: "nope" }, "hostname")).toEqual([]);
  });
});

describe("getSuggestionFieldKey", () => {
  it("maps synonyms to canonical suggestion keys", () => {
    expect(getSuggestionFieldKey({ key: "os_platform" })).toBe("platform");
    expect(getSuggestionFieldKey({ key: "device_name" })).toBe("hostname");
    expect(getSuggestionFieldKey({ key: "policy_version" })).toBe("policyVersion");
    expect(getSuggestionFieldKey({ key: "local_ip" })).toBe("ip");
  });
  it("passes the raw key through when unmapped", () => {
    expect(getSuggestionFieldKey({ key: "custom_field" })).toBe("custom_field");
  });
});

describe("operator shape detection", () => {
  it("isIpSubnetOperator matches subnet/cidr", () => {
    expect(isIpSubnetOperator({ key: "in_subnet" })).toBe(true);
    expect(isIpSubnetOperator({ label: "In Subnet" })).toBe(true);
    expect(isIpSubnetOperator({ key: "equals" })).toBe(false);
  });
  it("operatorExpectsArray matches multi-value ops + flags", () => {
    expect(operatorExpectsArray({ key: "in" })).toBe(true);
    expect(operatorExpectsArray({ label: "is any of" })).toBe(true);
    expect(operatorExpectsArray({ multiple: true })).toBe(true);
    expect(operatorExpectsArray({ key: "equals" })).toBe(false);
  });
  it("operatorAllowsPartialText matches contains/matches/starts/ends", () => {
    expect(operatorAllowsPartialText({ key: "contains" })).toBe(true);
    expect(operatorAllowsPartialText({ label: "Starts With" })).toBe(true);
    expect(operatorAllowsPartialText({ key: "equals" })).toBe(false);
  });
});

describe("parseCommaSeparatedValues", () => {
  it("trims tokens and drops empties", () => {
    expect(parseCommaSeparatedValues("a, ,b,")).toEqual(["a", "b"]);
  });
  it("returns [] for non-strings", () => {
    expect(parseCommaSeparatedValues(null)).toEqual([]);
    expect(parseCommaSeparatedValues(["a"])).toEqual([]);
  });
});

describe("field capability helpers", () => {
  it("shouldUseRemoteAutocomplete for known suggestion fields only", () => {
    expect(shouldUseRemoteAutocomplete("hostname")).toBe(true);
    expect(shouldUseRemoteAutocomplete("custom_field")).toBe(false);
  });
  it("isCatalogLikeField only for platform/pluginEnabled", () => {
    expect(isCatalogLikeField("platform")).toBe(true);
    expect(isCatalogLikeField("pluginEnabled")).toBe(true);
    expect(isCatalogLikeField("hostname")).toBe(false);
  });
  it("getLocalFallbackOptions returns the right table", () => {
    expect(getLocalFallbackOptions("platform")).toBe(PLATFORM_FALLBACK_OPTIONS);
    expect(getLocalFallbackOptions("pluginEnabled")).toBe(PLUGIN_ENABLED_OPTIONS);
    expect(getLocalFallbackOptions("hostname")).toEqual([]);
  });
});

describe("getPlaceholder", () => {
  it("prefers the multiple prompt, then field-specific text", () => {
    expect(getPlaceholder("hostname", true, false)).toBe("Select one or more values…");
    expect(getPlaceholder("ip", false, true)).toMatch(/e\.g\. 160/);
    expect(getPlaceholder("architecture", false, false)).toBe("Select architecture…");
    expect(getPlaceholder("unknown_field", false, false)).toBe("Value");
  });
});

describe("getHelperText", () => {
  it("surfaces error and loading first", () => {
    expect(getHelperText({ fieldKey: "ip", error: "boom" })).toBe("boom");
    expect(getHelperText({ fieldKey: "ip", loading: true })).toBe("Loading suggestions...");
  });
  it("nudges to type 2+ chars for non-catalog fields", () => {
    expect(getHelperText({ fieldKey: "hostname", search: "a" })).toMatch(/at least 2 characters/);
  });
  it("gives field-specific guidance", () => {
    expect(getHelperText({ fieldKey: "platform" })).toMatch(/supported platform/);
    expect(getHelperText({ fieldKey: "policyVersion", multiple: true })).toMatch(/one or more tenant policy/);
  });
});
