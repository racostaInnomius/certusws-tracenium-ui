// src/utils/revealWhileSettling.js
//
// Llevar la vista a un elemento y MANTENERLA ahí mientras la página termina de
// cargar lo que tiene encima.
//
// 🔴 28-sep: desde Patch Management, «Open in Assets» abría la ficha del equipo
// (`?device=`) y no se veía nada. El scroll se hacía al montar, cuando la página
// aún cargaba y cabía en pantalla —no había a dónde bajar—; después llegaban las
// tarjetas de arriba (salud, Device experience, atención) y empujaban la ficha
// bajo el pliegue. Parecía un clic muerto.
//
// Durante `settleMs` se vuelve a colocar el elemento cada vez que se mueve. En
// cuanto el operador toca la rueda, el teclado o el ratón, se para: la vista es
// suya y no se le pelea.

const USER_INPUT = ["wheel", "touchstart", "keydown", "mousedown"];

export function revealWhileSettling(getElement, { settleMs = 4000, win = window, now = () => Date.now() } = {}) {
  let stopped = false;
  let frame = null;
  const startedAt = now();
  let lastTop = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frame != null) win.cancelAnimationFrame?.(frame);
    USER_INPUT.forEach((type) => win.removeEventListener(type, stop, true));
  };
  USER_INPUT.forEach((type) => win.addEventListener(type, stop, { capture: true, passive: true }));

  const topOf = (el) => Math.round(el.getBoundingClientRect().top);
  const tick = () => {
    frame = null;
    if (stopped) return;
    const el = getElement();
    if (el && (lastTop === null || topOf(el) !== lastTop)) {
      // Sin «smooth»: un desplazamiento animado todavía en curso se mediría
      // como «se ha movido» y se relanzaría en cada fotograma.
      el.scrollIntoView?.({ block: "start" });
      lastTop = topOf(el);
    }
    if (now() - startedAt >= settleMs) {
      stop();
      return;
    }
    frame = win.requestAnimationFrame(tick);
  };
  frame = win.requestAnimationFrame(tick);
  return stop;
}
