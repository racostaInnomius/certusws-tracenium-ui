// src/utils/platform.js
//
// Canonical device-platform normalization + display labels.
//
// Previously copy-pasted (and quietly diverging) in AssetsDashboard.jsx and
// AssetManagement/InactiveAssetsTable.jsx — the two disagreed on empty input,
// "windows server", and ios/android/linux mapping, so the SAME device could
// be classified differently on different screens. This is the single source.
//
// NOTE: AssetGroups.jsx's `normalizePlatformCriteriaValue` is a DIFFERENT
// concern (normalizing filter-criteria values via an alias map) and is left
// alone.

/**
 * Normalize a raw OS/platform string to a canonical key.
 * Returns null for empty/blank input; passes unknown tokens through as
 * lowercased text so filters/labels still render something meaningful.
 * "windows server" is preserved as distinct from "windows" (the inactive-
 * assets filter treats them separately).
 */
export function normalizePlatform(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "windows server" || v === "windows-server" || v === "win server") return "windows server";
  if (v === "windows" || v === "win32" || v.startsWith("win")) return "windows";
  if (v === "macos" || v === "macosx" || v === "darwin" || v === "osx" || v === "mac os x") return "macos";
  if (v === "linux") return "linux";
  if (v === "ios" || v === "ipados") return "ios";
  if (v === "android") return "android";
  return v;
}

const PLATFORM_LABELS = {
  windows: "Windows",
  "windows server": "Windows Server",
  macos: "macOS",
  linux: "Linux",
  ios: "iOS",
  android: "Android",
};

/**
 * Human display label for a platform key (from normalizePlatform).
 * Falls back to a capitalized version of unknown tokens.
 */
export function platformLabel(rawOrKey) {
  const key = normalizePlatform(rawOrKey);
  if (!key) return "Unknown";
  if (PLATFORM_LABELS[key]) return PLATFORM_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** True when the platform is a managed mobile OS. */
export function isMobilePlatform(rawOrKey) {
  const key = normalizePlatform(rawOrKey);
  return key === "ios" || key === "android";
}
