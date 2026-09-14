// src/hooks/useAnimatedNumber.js
//
// Un número que llega a su valor en vez de aparecer (el gauge de Assessment
// Suite). Anima desde el último valor pintado —0 la primera vez— con
// ease-out cúbico.
//
// Sin animación, el valor final directo:
//   · si el usuario pidió `prefers-reduced-motion: reduce`;
//   · si no hay matchMedia o requestAnimationFrame (jsdom en los tests, SSR),
//     para que nada que lea el número vea un valor intermedio.

import * as React from "react";

export function canAnimate() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function" || typeof window.requestAnimationFrame !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function useAnimatedNumber(target, { duration = 900 } = {}) {
  const animate = canAnimate();
  const [value, setValue] = React.useState(() => (animate && Number.isFinite(target) ? 0 : target));
  const lastRef = React.useRef(animate ? 0 : target);

  React.useEffect(() => {
    if (!Number.isFinite(target) || !canAnimate()) {
      lastRef.current = target;
      setValue(target);
      return undefined;
    }
    const from = Number.isFinite(lastRef.current) ? lastRef.current : 0;
    if (from === target) {
      setValue(target);
      return undefined;
    }
    let raf = 0;
    const start = window.performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (target - from) * easeOutCubic(t);
      lastRef.current = v;
      setValue(v);
      if (t < 1) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
