import { describe, it, expect } from "vitest";
import { diffPolicies, flattenPolicy, formatDiffValue } from "./policyDiff";

describe("flattenPolicy", () => {
  it("produces dotted leaves with arrays kept whole", () => {
    const flat = flattenPolicy({ features: { remoteShell: true }, plugins: { enabled: ["amp", "scp"] }, cdp: { intervalSeconds: 900 } });
    expect([...flat.entries()]).toEqual([
      ["cdp.intervalSeconds", 900],
      ["features.remoteShell", true],
      ["plugins.enabled", ["amp", "scp"]],
    ]);
  });
  it("keeps an empty object as a leaf so its removal is visible", () => {
    expect([...flattenPolicy({ modules: {} }).entries()]).toEqual([["modules", {}]]);
  });
});

describe("diffPolicies", () => {
  it("returns nothing for equal documents regardless of key order", () => {
    const a = { features: { a: 1, b: 2 }, plugins: { enabled: ["amp"] } };
    const b = { plugins: { enabled: ["amp"] }, features: { b: 2, a: 1 } };
    expect(diffPolicies(a, b)).toEqual([]);
  });

  it("classifies added, removed and changed leaves", () => {
    const before = { features: { remoteShell: true, remoteFile: true }, cdp: { intervalSeconds: 900 } };
    const after = { features: { remoteShell: false, deviceInfoWidget: true }, cdp: { intervalSeconds: 900 } };
    expect(diffPolicies(before, after)).toEqual([
      { path: "features.deviceInfoWidget", before: undefined, after: true, kind: "added" },
      { path: "features.remoteFile", before: true, after: undefined, kind: "removed" },
      { path: "features.remoteShell", before: true, after: false, kind: "changed" },
    ]);
  });

  it("treats an array change as one changed leaf", () => {
    const d = diffPolicies({ plugins: { enabled: ["amp", "scp"] } }, { plugins: { enabled: ["amp"] } });
    expect(d).toEqual([{ path: "plugins.enabled", before: ["amp", "scp"], after: ["amp"], kind: "changed" }]);
  });

  it("is the guard the T111 incident needed: dropping five plugins shows as one loud line", () => {
    const d = diffPolicies({ plugins: { enabled: ["amp", "scp", "pmp", "sdp", "cdp", "rcp"] } }, { plugins: { enabled: ["amp"] } });
    expect(d[0].kind).toBe("changed");
    expect(d[0].before).toHaveLength(6);
    expect(d[0].after).toHaveLength(1);
  });

  it("tolerates null documents", () => {
    expect(diffPolicies(null, { a: 1 })).toEqual([{ path: "a", before: undefined, after: 1, kind: "added" }]);
  });
});

describe("formatDiffValue", () => {
  it("renders the values an operator has to read", () => {
    expect(formatDiffValue(undefined)).toBe("—");
    expect(formatDiffValue(null)).toBe("null");
    expect(formatDiffValue("")).toBe('""');
    expect(formatDiffValue("abc")).toBe("abc");
    expect(formatDiffValue([1, 2])).toBe("[1,2]");
    expect(formatDiffValue(true)).toBe("true");
  });
});
