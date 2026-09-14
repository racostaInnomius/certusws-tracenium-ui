// src/hooks/useAnimatedNumber.test.js

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { easeOutCubic, useAnimatedNumber } from "./useAnimatedNumber";

function installFrames({ reduced = false } = {}) {
  let now = 0;
  const queue = new Map();
  let nextId = 1;
  vi.stubGlobal("matchMedia", (q) => ({ matches: reduced && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", (cb) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id) => queue.delete(id));
  vi.spyOn(window.performance, "now").mockImplementation(() => now);
  return {
    advance(ms) {
      now += ms;
      const cbs = [...queue.values()];
      queue.clear();
      act(() => cbs.forEach((cb) => cb(now)));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAnimatedNumber", () => {
  it("sin matchMedia (jsdom) da el valor final directo", () => {
    const { result } = renderHook(() => useAnimatedNumber(51));
    expect(result.current).toBe(51);
  });

  it("⭐ anima de 0 al valor con ease-out y termina exactamente en él", () => {
    const frames = installFrames();
    const { result } = renderHook(() => useAnimatedNumber(51, { duration: 900 }));
    expect(result.current).toBe(0);
    frames.advance(450);
    expect(result.current).toBeCloseTo(51 * easeOutCubic(0.5), 5);
    frames.advance(450);
    expect(result.current).toBe(51);
  });

  it("un score nuevo anima desde el anterior, no desde 0", () => {
    const frames = installFrames();
    const { result, rerender } = renderHook(({ v }) => useAnimatedNumber(v, { duration: 100 }), { initialProps: { v: 51 } });
    frames.advance(100);
    expect(result.current).toBe(51);
    rerender({ v: 72 });
    frames.advance(50);
    expect(result.current).toBeGreaterThan(51);
    expect(result.current).toBeLessThan(72);
    frames.advance(50);
    expect(result.current).toBe(72);
  });

  it("con prefers-reduced-motion no anima", () => {
    installFrames({ reduced: true });
    const { result } = renderHook(() => useAnimatedNumber(51));
    expect(result.current).toBe(51);
  });
});
