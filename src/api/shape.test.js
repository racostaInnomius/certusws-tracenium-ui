import { describe, it, expect, vi, afterEach } from "vitest";
import { asArray, asObject, listFrom } from "./shape";

afterEach(() => vi.restoreAllMocks());

describe("asArray", () => {
  it("passes arrays through", () => {
    const a = [1, 2];
    expect(asArray(a)).toBe(a);
  });
  it("coerces non-arrays to []", () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray({ x: 1 })).toEqual([]);
    expect(asArray("nope")).toEqual([]);
  });
});

describe("asObject", () => {
  it("passes plain objects through", () => {
    const o = { a: 1 };
    expect(asObject(o)).toBe(o);
  });
  it("coerces arrays/primitives to {}", () => {
    expect(asObject([1, 2])).toEqual({});
    expect(asObject(null)).toEqual({});
    expect(asObject("x")).toEqual({});
  });
});

describe("listFrom", () => {
  it("returns a bare array unchanged", () => {
    const a = [1, 2, 3];
    expect(listFrom(a)).toBe(a);
  });
  it("unwraps common list wrappers", () => {
    expect(listFrom({ items: [1] })).toEqual([1]);
    expect(listFrom({ data: [2] })).toEqual([2]);
    expect(listFrom({ rows: [3] })).toEqual([3]);
    expect(listFrom({ results: [4] })).toEqual([4]);
  });
  it("honors custom keys (e.g. deviceIds)", () => {
    expect(listFrom({ deviceIds: ["a", "b"] }, { keys: ["deviceIds", "items"] })).toEqual(["a", "b"]);
  });
  it("returns [] when no array is present", () => {
    expect(listFrom(null)).toEqual([]);
    expect(listFrom({ total: 0 })).toEqual([]);
    expect(listFrom(undefined)).toEqual([]);
  });
});
