// src/components/CryptoDiscovery/osTlsFixStates.js
//
// ADR-0024 — cómo se nombra cada estado de «puede migrar, pero requiere el
// fix» y cómo se pinta la columna ML-KEM de Inventory. Aparte de los
// componentes para que Fast Refresh no los recargue enteros y para que la
// columna y el panel hablen con las mismas palabras.

import { BRAND, TEXT_MUTED } from "../../theme/brand";

// Los estados que devuelve `agility.fixable[].state`. El orden es el de la
// acción: primero lo que está a un ajuste de distancia.
export const OS_TLS_FIX_STATE = {
  needs_fix: {
    label: "ML-KEM groups turned off — enable X25519_MLKEM768",
    hint: "The Windows TLS stack (SChannel) on this build has the post-quantum groups but ships them disabled. Enabling the group is a configuration change on the device; it affects every Windows TLS connection it makes (not browsers, which carry their own)."
  },
  policy_managed: {
    label: "A group policy sets the TLS group list",
    hint: "An «ECC Curve Order» group policy controls this list, so a local change would be undone at the next policy refresh. Add X25519_MLKEM768 to that policy, keeping the default groups in it."
  },
  needs_os_update: {
    label: "Install the Windows cumulative update first",
    hint: "The ML-KEM groups arrived in a cumulative update (26100.8514 / 26200.8514 for Windows 11 24H2/25H2). This device is below it, did not report its patch level, or refuses the group even though it is listed."
  }
};


/**
 * La columna ML-KEM de Inventory → By device, con el MISMO veredicto que el
 * roadmap (`pqKem.state`). Antes sólo había `supported=false` y pintaba
 * «No hybrid» en rojo a un Windows 11 25H2 con el grupo apagado, que en
 * Roadmap sale como «can migrate — need a fix». Rojo sólo para lo que de
 * verdad no puede; ámbar para lo que está a un ajuste o una actualización.
 */
export function pqKemChip(v) {
  if (!v) return { label: "", bg: "transparent", color: TEXT_MUTED, outlined: true };
  if (v.supported === true || v.state === "ready") return { label: "Hybrid OK", bg: BRAND.alert.successSoft, color: BRAND.alert.successText };
  if (v.supported == null) return { label: "Not measured", bg: "transparent", color: TEXT_MUTED, outlined: true };
  const amber = { bg: BRAND.alert.warningSoft, color: BRAND.alert.warningText };
  if (v.state === "needs_fix") return { label: "Off — can enable", ...amber };
  if (v.state === "policy_managed") return { label: "Off — set by GPO", ...amber };
  if (v.state === "needs_os_update") return { label: "Needs OS update", ...amber };
  // cannot_migrate, o un backend anterior sin `state`: lo que dice la medición.
  return { label: "No hybrid", bg: BRAND.alert.errorSoft, color: BRAND.alert.errorText };
}
