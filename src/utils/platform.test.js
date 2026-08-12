import { describe, it, expect } from "vitest";
import { normalizePlatform, platformLabel, isMobilePlatform } from "./platform";

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
