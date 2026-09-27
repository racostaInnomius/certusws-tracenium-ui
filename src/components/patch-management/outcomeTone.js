// src/components/patch-management/outcomeTone.js
//
// El color de cada resultado de una remediación, igual en todas partes
// («Apply fixes on …» de la ficha y el drawer de «Fix»).
//
// 27-sep: los resultados salían todos en el mismo gris y había que LEER cada
// chip para saber qué se había aplicado. Ahora el tono dice qué pasó:
//   · verde   — aplicado (el fix cambió algo)
//   · ámbar   — aplicado, pero hace falta reiniciar
//   · teal    — ya cumplía / la simulación dice que se aplicaría
//   · rojo    — falló, rechazado, sin respuesta
//   · gris    — pendiente, en curso, cancelado
// Texto con los tokens *Text sobre los *Soft (el `success` de relleno no
// llega a contraste como texto: ver project_ui_fill_vs_text_tokens).

import { BRAND } from "../../theme/brand";

const TONES = {
  applied: "success",
  applied_reboot_required: "warning",
  already_compliant: "info",
  dryrun_already_compliant: "info",
  dryrun_would_apply: "info",
  failed: "error",
  rejected: "error",
  timed_out: "error",
  pending: "neutral",
  running: "neutral",
  cancelled: "neutral",
};

const PALETTE = {
  success: () => ({ bg: BRAND.alert.successSoft, fg: BRAND.alert.successText }),
  warning: () => ({ bg: BRAND.alert.warningSoft, fg: BRAND.alert.warningText }),
  info: () => ({ bg: BRAND.alert.infoSoft, fg: BRAND.alert.infoText }),
  error: () => ({ bg: BRAND.alert.errorSoft, fg: BRAND.alert.errorText }),
  neutral: () => ({ bg: BRAND.darkSoft, fg: BRAND.gray }),
};

/** 'success' | 'warning' | 'info' | 'error' | 'neutral' */
export function outcomeTone(outcome) {
  return TONES[String(outcome ?? "").toLowerCase()] ?? "neutral";
}

/** `{ bg, fg }` para pintar el chip de un resultado. */
export function outcomeColors(outcome) {
  return PALETTE[outcomeTone(outcome)]();
}
