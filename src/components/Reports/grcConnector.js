// src/components/Reports/grcConnector.js
//
// Pure helpers for the GRC connector panel (ADR-0014 E4).

export const TARGET_KINDS = [
  { value: "webhook", label: "Signed webhook" },
  { value: "vanta", label: "Vanta (private integration)" },
  { value: "sharepoint", label: "SharePoint document library" },
];

export function targetKindLabel(kind) {
  return TARGET_KINDS.find((k) => k.value === kind)?.label || kind || "—";
}

export function describeTarget(target) {
  const c = target?.config || {};
  if (target?.kind === "webhook") return c.url || "—";
  if (target?.kind === "vanta") return `resource ${c.resourceId || "—"} · client ${c.clientId || "—"}`;
  // Se enseña la CARPETA además del sitio: es lo que el operador va a abrir
  // para comprobar que el pack llegó.
  if (target?.kind === "sharepoint") return `${c.siteId || "—"} · ${c.rootFolder || "04-Evidence"}/<framework>/<period>`;
  return "";
}

export function deliveryColor(status) {
  if (status === "ok") return "success";
  if (status === "skipped") return "warning";
  if (status === "failed") return "error";
  return "default";
}
