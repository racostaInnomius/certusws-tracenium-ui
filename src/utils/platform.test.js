import { describe, it, expect } from "vitest";
import { normalizePlatform, platformLabel, isMobilePlatform, platformColor } from "./platform";

describe("normalizePlatform", () => {
  it("maps known aliases to canonical keys", () => {
    expect(normalizePlatform("Windows")).toBe("windows");
    expect(normalizePlatform("win32")).toBe("windows");
    expect(normalizePlatform("Darwin")).toBe("macos");
    expect(normalizePlatform("OSX")).toBe("macos");
    expect(normalizePlatform("Linux")).toBe("linux");
    expect(normalizePlatform("iPadOS")).toBe("ios");
    expect(normalizePlatform("android")).toBe("android");
  });
  it("preserves 'windows server' as distinct from 'windows'", () => {
    expect(normalizePlatform("Windows Server")).toBe("windows server");
    expect(normalizePlatform("windows")).toBe("windows");
  });
  it("recognizes the backend's 'windows_server' (underscore) wire format", () => {
    // modules/dashboard/os-version-normalizer.ts emits os_platform: "windows_server"
    // for the OS Versions aggregate. Without this alias it falls through to the
    // `startsWith("win")` branch and gets misclassified as plain "windows",
    // which is exactly the bug that made Windows Server bars render blue
    // instead of purple in AssetsDashboard's OS Versions list.
    expect(normalizePlatform("windows_server")).toBe("windows server");
  });
  it("returns null for empty/blank", () => {
    expect(normalizePlatform("")).toBeNull();
    expect(normalizePlatform(null)).toBeNull();
    expect(normalizePlatform("   ")).toBeNull();
  });
  it("passes unknown tokens through lowercased", () => {
    expect(normalizePlatform("FreeBSD")).toBe("freebsd");
  });
});

describe("platformLabel", () => {
  it("gives friendly labels", () => {
    expect(platformLabel("macos")).toBe("macOS");
    expect(platformLabel("ios")).toBe("iOS");
    expect(platformLabel("windows server")).toBe("Windows Server");
    expect(platformLabel("android")).toBe("Android");
    expect(platformLabel(null)).toBe("Unknown");
    expect(platformLabel("freebsd")).toBe("Freebsd");
  });
});

describe("isMobilePlatform", () => {
  it("is true only for ios/android", () => {
    expect(isMobilePlatform("ios")).toBe(true);
    expect(isMobilePlatform("android")).toBe(true);
    expect(isMobilePlatform("windows")).toBe(false);
    expect(isMobilePlatform(null)).toBe(false);
  });
});

describe("platformColor", () => {
  it("gives every known platform its own distinct color set", () => {
    const keys = ["windows", "windows server", "macos", "linux", "ios", "android"];
    const seen = new Set();
    for (const key of keys) {
      const { dot, fg, bg } = platformColor(key);
      expect(dot).toBeTruthy();
      expect(fg).toBeTruthy();
      expect(bg).toBeTruthy();
      // No two platforms should ever collide on the same swatch — that's
      // the exact bug this module exists to prevent (Windows/Windows
      // Server used to render near-identical shades).
      expect(seen.has(dot)).toBe(false);
      seen.add(dot);
    }
  });

  it("gives Windows and Windows Server visibly different colors, not just different keys", () => {
    expect(platformColor("windows").dot).not.toBe(platformColor("windows server").dot);
  });

  it("resolves raw/aliased platform strings the same as normalizePlatform does", () => {
    expect(platformColor("Windows Server").dot).toBe(platformColor("windows server").dot);
    expect(platformColor("Darwin").dot).toBe(platformColor("macos").dot);
    expect(platformColor("win32").dot).toBe(platformColor("windows").dot);
  });

  it("falls back to a neutral color for null/unrecognized platforms, without crashing", () => {
    expect(platformColor(null)).toEqual({ dot: "#BEBEBE", fg: "#BEBEBE", bg: "rgba(190,190,190,0.08)" });
    expect(platformColor("freebsd")).toEqual({ dot: "#BEBEBE", fg: "#BEBEBE", bg: "rgba(190,190,190,0.08)" });
  });
});
