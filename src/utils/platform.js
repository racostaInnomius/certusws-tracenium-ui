// src/utils/platform.js
//
// Canonical device-platform normalization + display labels + colors.
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
  if (v === "windows server" || v === "windows-server" || v === "windows_server" || v === "win server") return "windows server";
  if (v === "windows" || v === "win32" || v.startsWith("win")) return "windows";
  if (v === "macos" || v === "macosx" || v === "darwin" || v === "osx" || v === "mac os x") return "macos";
  // Individual distro families the backend's OS-version normalizer emits
  // (os-version-normalizer.ts's inferFamily) — all Linux for coloring
  // purposes, same orange dot as the generic "linux" bucket.
  if (
    v === "linux" ||
    v === "ubuntu" ||
    v === "debian" ||
    v === "fedora" ||
    v === "rhel" ||
    v === "red hat" ||
    v === "redhat" ||
    v === "rocky" ||
    v === "alma" ||
    v === "centos"
  ) {
    return "linux";
  }
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

// Canonical per-platform color, referenced against each OS's own brand
// where one exists. Previously every donut/bar/chip picked its own colors
// — some by OS identity (three different, disagreeing maps), some by
// array position (whichever platform happened to have the most hosts for
// a given tenant got whatever color sat first in the array), so the same
// OS could render differently across Overview, Asset Management, and even
// within the same table depending on device counts that day. One map,
// keyed by the same canonical keys `normalizePlatform` returns:
//   - `dot`: the vivid, brand-referenced hue — donut slices, legend dots,
//     chart bars.
//   - `fg`: chip text color. Equal to `dot` except where the literal brand
//     hue is too pale to read as text (Android's brand green is close to
//     unreadable at 11px — kept the darker green this app already used).
//   - `bg`: chip background tint, ~10-14% of `dot`.
// Windows = Microsoft's blue. Windows Server = Microsoft's purple (Azure
// AD / Windows Server Insider branding) — a different hue on purpose, so
// it never reads as "the same as Windows" the way two shades of the same
// dark gray did before. macOS/iOS have no single Apple brand color, so
// macOS gets Apple's hardware "space gray" and iOS gets Apple's own
// systemIndigo (distinct from Windows' blue). Linux gets Ubuntu's orange
// — the distro most fleets actually run. Android keeps its official green.
const PLATFORM_COLORS = {
  windows: { dot: "#0078D4", fg: "#0078D4", bg: "rgba(0,120,212,0.10)" },
  "windows server": { dot: "#5C2D91", fg: "#5C2D91", bg: "rgba(92,45,145,0.10)" },
  macos: { dot: "#6E7780", fg: "#6E7780", bg: "rgba(110,119,128,0.12)" },
  linux: { dot: "#E95420", fg: "#E95420", bg: "rgba(233,84,32,0.12)" },
  ios: { dot: "#5E5CE6", fg: "#5E5CE6", bg: "rgba(94,92,230,0.12)" },
  android: { dot: "#3DDC84", fg: "#1B7A45", bg: "rgba(61,220,132,0.14)" },
};

const UNKNOWN_PLATFORM_COLOR = { dot: "#BEBEBE", fg: "#BEBEBE", bg: "rgba(190,190,190,0.08)" };

/**
 * Canonical `{ dot, fg, bg }` color set for a platform (raw string or
 * already-normalized key). Same fallback for null/unrecognized input as
 * `platformLabel` — every caller renders *something* instead of crashing
 * on an unexpected backend value.
 */
export function platformColor(rawOrKey) {
  const key = normalizePlatform(rawOrKey);
  if (!key) return UNKNOWN_PLATFORM_COLOR;
  return PLATFORM_COLORS[key] || UNKNOWN_PLATFORM_COLOR;
}
