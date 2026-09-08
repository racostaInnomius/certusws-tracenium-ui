// src/components/Reports/reportGroups.js
//
// El `group` que manda el servidor, dicho como se llama la página en el menú.
//
// El registro agrupa por la SIGLA del plugin —"SCP", "PMP", "CDP"— porque es
// lo que el backend usa internamente para entitlements y capacidades. En la
// consola nadie ve esas siglas: ve "Security Compliance", "Patch Management",
// "Crypto Discovery" en el menú lateral, y esos son los nombres con los que
// piensa. Un catálogo que pone "SCP" obliga a traducir mentalmente antes de
// encontrar el informe que se busca.
//
// La traducción vive en el FRONT y no en el registro a propósito: "SCP" es la
// clave de un plugin y la usan el gate, los entitlements y las rutas; el
// rótulo del menú es una decisión de presentación que cambia sin que cambie
// nada del backend.

/**
 * Sigla del registro → rótulo del menú lateral (`Sidebar.jsx`).
 *
 * `Global` no tiene plugin: es el informe de flota, que resume lo que enseña
 * Overview — y es la página desde la que se llega a él.
 */
export const REPORT_GROUP_LABELS = {
  SCP: "Security Compliance",
  PMP: "Patch Management",
  CDP: "Crypto Discovery",
  Audit: "Audit",
  Global: "Overview",
};

/**
 * Cómo se llama este grupo para quien lo lee.
 *
 * Un grupo desconocido se devuelve TAL CUAL en vez de caer en "Other": si el
 * backend añade un plugin y aquí no se añade su rótulo, ver la sigla es feo
 * pero deja el informe encontrable; mandarlo todo a "Other" lo esconde entre
 * los demás y nadie se entera de que falta una línea en este mapa.
 */
export function groupLabel(group) {
  const g = String(group || "").trim();
  if (!g) return "Other";
  return REPORT_GROUP_LABELS[g] || g;
}
