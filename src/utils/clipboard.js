// Copiar al portapapeles, con respaldo.
//
// ⚠️ `navigator.clipboard.writeText` falla aunque el clic sea real cuando el
// permiso `clipboard-write` está denegado: el navegador integrado de la app de
// Claude (30-sep, «Document is not focused», permiso `denied`), o fuera de un
// contexto seguro. `execCommand("copy")` sobre un textarea temporal no depende
// de ese permiso —sólo del gesto del usuario, que sigue vigente tras la
// promesa rechazada— y en ese mismo navegador sí copia (medido con pbpaste).

/**
 * El textarea va dentro del diálogo abierto, si lo hay: el FocusTrap de MUI
 * devuelve el foco al diálogo cuando algo de fuera lo recibe, y la selección
 * se perdería antes de copiar.
 */
function legacyCopy(text) {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const previous = document.activeElement;
  const host = previous?.closest?.('[role="dialog"]') ?? document.body;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.setAttribute("aria-hidden", "true");
  ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
  host.appendChild(ta);
  try {
    ta.focus({ preventScroll: true });
    ta.select();
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    ta.remove();
    previous?.focus?.();
  }
}

/** Resuelve si copió; rechaza si no pudo ninguna de las dos vías. */
export async function copyText(text) {
  const value = String(text ?? "");
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Permiso denegado o documento sin foco: probar el respaldo.
    }
  }
  if (!legacyCopy(value)) throw new Error("clipboard_unavailable");
}
