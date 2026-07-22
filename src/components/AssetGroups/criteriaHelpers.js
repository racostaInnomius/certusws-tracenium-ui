// src/components/AssetGroups/criteriaHelpers.js
//
// Pure helpers + lookup tables for the Asset Groups dynamic-criteria builder,
// extracted from the AssetGroups god-component. No React, no I/O — just the
// normalization, operator-shape detection, and catalog/suggestion logic that
// the CriteriaBuilder and its value editors depend on. Kept as one cohesive
// module because the functions reference each other and the platform/operator
// lookup tables.

export const PLATFORM_FALLBACK_OPTIONS = [
  { label: "Windows", value: "windows", description: "Windows workstation devices" },
  { label: "Windows Server", value: "windows-server", description: "Windows Server devices" },
  { label: "macOS", value: "macos", description: "Apple macOS devices" },
  { label: "Linux", value: "linux", description: "Linux devices" },
  { label: "Unknown", value: "unknown", description: "Devices without reliable platform classification" },
];

export const PLUGIN_ENABLED_OPTIONS = [
  { label: "Enabled", value: "true", description: "Plugin is enabled" },
  { label: "Disabled", value: "false", description: "Plugin is disabled" },
];

export const PLATFORM_CANONICAL_LABELS = {
  macos: "macOS",
  windows: "Windows",
  "windows-server": "Windows Server",
  linux: "Linux",
  unknown: "Unknown",
};

export const PLATFORM_VALUE_ALIASES = {
  mac: "macos",
  "mac-os": "macos",
  macos: "macos",
  osx: "macos",
  darwin: "macos",
  win: "windows",
  windows: "windows",
  "windows-workstation": "windows",
  "windows-client": "windows",
  "windows-server": "windows-server",
  "windows_server": "windows-server",
  "win-server": "windows-server",
  winserver: "windows-server",
  linux: "linux",
  ubuntu: "linux",
  debian: "linux",
  rhel: "linux",
  centos: "linux",
  unknown: "unknown",
};

export const MULTI_VALUE_OPS = new Set([
  "in",
  "not_in",
  "notin",
  "nin",
  "any",
  "any_of",
  "is_any_of",
  "isanyof",
  "is_none_of",
  "isnoneof",
  "none_of",
]);

export const PARTIAL_TEXT_OPS = new Set([
  "contains",
  "matches",
  "starts_with",
  "startswith",
  "ends_with",
  "endswith",
]);

export function normalizeOptionLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function normalizeCatalogOption(option) {
  if (option == null) return null;

  if (typeof option === "string") {
    const value = option.trim();
    if (!value) return null;
    return {
      label: normalizeOptionLabel(value),
      value,
      description: "Available value",
    };
  }

  const value = String(option.value ?? option.key ?? option.id ?? option.label ?? "").trim();
  if (!value) return null;

  return {
    label: String(option.label ?? normalizeOptionLabel(value)).trim(),
    value,
    description: option.description || option.subtitle || option.details || "Available value",
  };
}

export function normalizeCriteriaKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePlatformCriteriaValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const aliasKey = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return PLATFORM_VALUE_ALIASES[aliasKey] || raw;
}

export function normalizeSuggestionValue(fieldKey, value) {
  if (normalizeCriteriaKey(fieldKey) === "platform") {
    return normalizePlatformCriteriaValue(value);
  }
  return String(value ?? "").trim();
}

export function normalizeSuggestionOption(option, fieldKey) {
  const normalized = normalizeCatalogOption(option);
  if (!normalized) return null;

  const value = normalizeSuggestionValue(fieldKey, normalized.value);
  if (!value) return null;

  const canonicalLabel =
    normalizeCriteriaKey(fieldKey) === "platform"
      ? PLATFORM_CANONICAL_LABELS[value]
      : null;

  return {
    ...normalized,
    label: canonicalLabel || normalized.label || normalizeOptionLabel(value),
    value,
  };
}

export function getCatalogOptions(fieldSpec, fieldKey) {
  const rawOptions =
    fieldSpec?.options ||
    fieldSpec?.values ||
    fieldSpec?.suggestions ||
    fieldSpec?.allowedValues ||
    [];

  return (Array.isArray(rawOptions) ? rawOptions : [])
    .map((option) => normalizeSuggestionOption(option, fieldKey || fieldSpec?.key))
    .filter(Boolean);
}

export function getSuggestionFieldKey(fieldSpec, fieldKey) {
  const key = normalizeCriteriaKey(fieldSpec?.key ?? fieldKey);
  const label = normalizeCriteriaKey(fieldSpec?.label);
  const candidate = key || label;

  if (["platform", "os_platform", "osplatform"].includes(candidate)) return "platform";
  if (["hostname", "host", "device_name", "devicename"].includes(candidate)) return "hostname";
  if (["os_release", "osrelease", "os_version", "osversion", "release"].includes(candidate)) return "osRelease";
  if (["agent_version", "agentversion"].includes(candidate)) return "agentVersion";
  if (["architecture", "arch"].includes(candidate)) return "architecture";
  // Always call the backend suggestion endpoint with the canonical
  // policyVersion alias. The persisted criteria field remains the
  // catalog key (for example policy_version) so existing backend
  // evaluators stay compatible, but autocomplete suggestions come from
  // CWSBtracenium.public.tenant_policies.policy_version through the
  // generic criteria-suggestions endpoint.
  if (["policy_version", "policyversion"].includes(candidate)) return "policyVersion";
  if (["plugin_enabled", "pluginenabled", "plugin"].includes(candidate)) return "pluginEnabled";
  if (["ip", "local_ip", "localip", "ip_address", "ipaddress"].includes(candidate)) return "ip";

  return fieldSpec?.key || fieldKey || "";
}

export function isIpSubnetOperator(opSpec) {
  const key = normalizeCriteriaKey(opSpec?.key ?? opSpec?.value);
  const label = normalizeCriteriaKey(opSpec?.label ?? opSpec?.name);
  return key === "in_subnet" || key === "cidr" || label.includes("subnet");
}

export function operatorExpectsArray(opSpec) {
  const key = normalizeCriteriaKey(opSpec?.key ?? opSpec?.value);
  const label = normalizeCriteriaKey(opSpec?.label ?? opSpec?.name);

  return (
    Boolean(opSpec?.expectsArray) ||
    Boolean(opSpec?.multiple) ||
    Boolean(opSpec?.isMulti) ||
    opSpec?.valueType === "array" ||
    opSpec?.inputType === "array" ||
    MULTI_VALUE_OPS.has(key) ||
    label.includes("any_of") ||
    label.includes("one_of") ||
    label.includes("in_list") ||
    label.includes("none_of")
  );
}

// Split a comma-separated string into a clean string[] — trim each token
// and drop empties so "a, ,b," yields ["a", "b"]. Used when an operator
// switches from a single-value to an array-value variant and the existing
// scalar text has to be lifted into the array shape the multi-value input
// (and backend) expects. Non-string input yields []. Mirrors the inline
// `.split(",").map(trim).filter(Boolean)` idiom used elsewhere in this file.
export function parseCommaSeparatedValues(value) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function operatorAllowsPartialText(opSpec) {
  const key = normalizeCriteriaKey(opSpec?.key ?? opSpec?.value);
  const label = normalizeCriteriaKey(opSpec?.label ?? opSpec?.name);
  return (
    PARTIAL_TEXT_OPS.has(key) ||
    label.includes("contains") ||
    label.includes("matches") ||
    label.includes("starts") ||
    label.includes("ends")
  );
}

export function shouldUseRemoteAutocomplete(fieldKey) {
  return [
    "platform",
    "pluginEnabled",
    "hostname",
    "osRelease",
    "agentVersion",
    "architecture",
    "policyVersion",
    "ip",
  ].includes(fieldKey);
}

export function isCatalogLikeField(fieldKey) {
  return fieldKey === "platform" || fieldKey === "pluginEnabled";
}

export function getLocalFallbackOptions(fieldKey) {
  if (fieldKey === "platform") return PLATFORM_FALLBACK_OPTIONS;
  if (fieldKey === "pluginEnabled") return PLUGIN_ENABLED_OPTIONS;
  return [];
}

export function getPlaceholder(fieldKey, multiple, partialText) {
  if (multiple) return "Select one or more values…";
  if (fieldKey === "ip") return partialText ? "e.g. 160 or 192.168" : "Select or type IP…";
  if (fieldKey === "hostname") return partialText ? "e.g. macbook or server" : "Select or type hostname…";
  if (fieldKey === "osRelease") return "Select or type OS release…";
  if (fieldKey === "agentVersion") return "Select or type agent version…";
  if (fieldKey === "architecture") return "Select architecture…";
  if (fieldKey === "policyVersion") return "Select or type tenant policy version…";
  if (fieldKey === "pluginEnabled") return "Select enabled state…";
  if (fieldKey === "platform") return "Select platform…";
  return "Value";
}

export function getHelperText({ fieldKey, search, error, loading, multiple, freeSolo }) {
  if (error) return error;
  if (loading) return "Loading suggestions...";
  if (!isCatalogLikeField(fieldKey) && String(search || "").trim().length > 0 && String(search || "").trim().length < 2) {
    return "Type at least 2 characters to search";
  }
  if (fieldKey === "platform") return "Select a supported platform bucket. Windows and Windows Server are evaluated separately.";
  if (fieldKey === "pluginEnabled") return "Select whether the plugin should be enabled or disabled.";
  if (fieldKey === "policyVersion") return multiple ? "Select one or more tenant policy versions. Suggestions come from tenant policies." : "Suggestions come from tenant policies. You can also type a policy version manually.";
  if (fieldKey === "ip") return multiple ? "Select multiple IPs or type a value and press Enter." : "Suggestions come from device IPs. Partial text is allowed for contains/matches operators.";
  if (freeSolo) return "Select a suggestion or type a custom value.";
  return multiple ? "Select one or more values." : "Select a suggested value.";
}
