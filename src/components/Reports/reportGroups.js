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

/**
 * Las páginas que tienen un botón "Report", en el ORDEN DEL MENÚ.
 *
 * El catálogo se listaba por informe. Eso contesta "¿qué puedo sacar?" pero no
 * la pregunta que de verdad se hace mirándolo hoy: "¿de qué páginas todavía no
 * hay informe?". Con seis informes para once páginas, la lista por informe
 * enseña seis filas y esconde las cinco ausencias.
 *
 * Por página, la ausencia OCUPA UNA FILA. Es la mitad del valor de esta vista.
 *
 * `group` es la sigla con la que el registro del backend agrupa sus tipos
 * (`REPORT_REGISTRY[].group`), o `null` si esa página no tiene ninguno propio.
 * `plugin` es la clave de entitlement, para no confundir "no está construido"
 * con "este tenant no lo tiene contratado" — que en una fila que dice 0 se
 * leen igual y significan cosas opuestas.
 *
 * `borrows` es la clave que el botón "Report" de esa página abre HOY mientras
 * no tenga informe propio. No es relleno: es lo que evita que la fila diga
 * "nada" cuando el operador acaba de pulsar ese botón y ha salido algo.
 *
 * ⚠️ Esta lista se mantiene A MANO junto a los botones "Report" de las
 * páginas. Un botón nuevo sin su entrada aquí deja la página fuera del
 * catálogo — que es exactamente el agujero que esta vista viene a cerrar. Hay
 * un test que compara esta lista con los rótulos del Sidebar.
 */
export const REPORT_PAGES = [
  { page: "overview",          label: "Overview",            group: "Global", plugin: null,  borrows: null },
  { page: "assets",            label: "Asset Management",    group: null,     plugin: "amp", borrows: "global.fleet-health" },
  { page: "software-delivery", label: "Software Delivery",   group: null,     plugin: "sdp", borrows: "global.fleet-health" },
  { page: "ad",                label: "Security Compliance", group: "SCP",    plugin: "scp", borrows: null },
  { page: "remote-control",    label: "Remote Control",      group: null,     plugin: "rcp", borrows: "global.fleet-health" },
  { page: "patch",             label: "Patch Management",    group: "PMP",    plugin: "pmp", borrows: null },
  { page: "cdp",               label: "Crypto Discovery",    group: "CDP",    plugin: "cdp", borrows: null },
  { page: "device-management", label: "MDM / MAM",           group: null,     plugin: "mdm", borrows: "global.fleet-health" },
  { page: "alerts",            label: "Alerts",              group: null,     plugin: null,  borrows: "audit.events" },
  { page: "jobs",              label: "Jobs",                group: null,     plugin: null,  borrows: "global.fleet-health" },
  { page: "audit",             label: "Audit",               group: "Audit",  plugin: null,  borrows: null },
];

/**
 * Reparte los tipos que manda el servidor entre las páginas de arriba.
 *
 * Un tipo cuyo `group` no case con ninguna página NO se tira: cae en una fila
 * "Other" al final. Perder un informe del catálogo porque nadie actualizó una
 * tabla sería peor que enseñar una fila fea.
 */
export function groupTypesByPage(types = []) {
  const porGrupo = new Map();
  for (const t of types) {
    const g = String(t?.group || "").trim();
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(t);
  }

  const filas = REPORT_PAGES.map((p) => ({
    ...p,
    types: p.group ? porGrupo.get(p.group) ?? [] : [],
  }));

  const usados = new Set(REPORT_PAGES.map((p) => p.group).filter(Boolean));
  const huerfanos = [...porGrupo.entries()]
    .filter(([g]) => g && !usados.has(g))
    .flatMap(([, ts]) => ts);
  if (huerfanos.length) {
    filas.push({ page: null, label: "Other", group: null, plugin: null, borrows: null, types: huerfanos });
  }
  return filas;
}
