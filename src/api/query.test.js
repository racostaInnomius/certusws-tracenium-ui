import { describe, it, expect } from "vitest";
import { buildQuery } from "./query";

describe("buildQuery", () => {
  it("returns '' for empty / all-blank params", () => {
    expect(buildQuery()).toBe("");
    expect(buildQuery({})).toBe("");
    expect(buildQuery({ a: "", b: null, c: undefined, d: "   " })).toBe("");
  });
  it("appends non-blank params, coercing to string", () => {
    expect(buildQuery({ search: "foo", page: 2 })).toBe("?search=foo&page=2");
  });
  it("drops blank/null/undefined but keeps 0 and false", () => {
    expect(buildQuery({ a: 0, b: false, c: null, d: "" })).toBe("?a=0&b=false");
  });
  it("url-encodes keys and values", () => {
    expect(buildQuery({ q: "a b&c" })).toBe("?q=a+b%26c");
  });
});
