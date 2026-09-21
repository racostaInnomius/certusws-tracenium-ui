// src/utils/jobOrigin.js
//
// Quién creó un job, en palabras de operador.
//
// ⚠️ POR QUÉ EXISTE. Los jobs que crea el propio backend firman con
// `created_by = "system:<motivo>"` y la columna "Who" enseñaba ese texto
// crudo. Un `reset_baseline` de `system:browser-extension-recovery` parecía
// un job que nadie había lanzado (el 14-sep, 35 en T111). Son
// autorreparaciones: el servidor perdió la foto de inventario de un equipo
// y se la pide otra vez. Eso es lo que tiene que decir la etiqueta.

const RECOVERY = "Automatic recovery";
const AUTOMATIC = "Automatic";

// system:<motivo> → { label, detail }. Los motivos salen de los `createdBy`
// del backend (baseline-reset-dispatch.ts, patch-management, software-delivery…).
const SYSTEM_ORIGINS = {
  "cold-projection-recovery": { label: RECOVERY, detail: "Software inventory re-sync" },
  "browser-extension-recovery": { label: RECOVERY, detail: "Browser extensions re-sync" },
  "asset-reprojection": { label: RECOVERY, detail: "Inventory rebuild" },
  "patch-gate": { label: AUTOMATIC, detail: "Patch pre-check" },
  "post-patch-scan": { label: AUTOMATIC, detail: "Scan after patching" },
  "snapshot-gate": { label: AUTOMATIC, detail: "VM snapshot before patching" },
  "dp-warmer": { label: AUTOMATIC, detail: "Distribution point pre-download" },
  "maintenance-window": { label: AUTOMATIC, detail: "Released by maintenance window" },
  "scheduled-deployment": { label: AUTOMATIC, detail: "Scheduled deployment" },
  "policy-group-sync": { label: AUTOMATIC, detail: "Policy group sync" },
};

function humanize(slug) {
  const s = String(slug || "").replace(/[-_:]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "System";
}

/**
 * { label, detail, automatic, recovery, raw } para la fila de un job.
 *
 * Una persona: su email (o su sujeto si no hay email). Un `system:*`: la
 * etiqueta y el motivo; `raw` conserva el texto original para el tooltip.
 */
export function describeJobOrigin(row) {
  const email = String(row?.created_by_email ?? "").trim();
  const raw = String(row?.created_by ?? "").trim();
  if (email) return { label: email, detail: null, automatic: false, recovery: false, raw: raw || email };
  if (!raw) return { label: AUTOMATIC, detail: "System", automatic: true, recovery: false, raw: "" };
  if (raw.startsWith("system:")) {
    const reason = raw.slice("system:".length);
    const known = SYSTEM_ORIGINS[reason];
    const label = known?.label ?? AUTOMATIC;
    return { label, detail: known?.detail ?? humanize(reason), automatic: true, recovery: label === RECOVERY, raw };
  }
  return { label: raw, detail: null, automatic: false, recovery: false, raw };
}

/** Texto plano para buscar/ordenar y para la ficha: "Automatic recovery · Software inventory re-sync". */
export function jobOriginText(row) {
  const o = describeJobOrigin(row);
  return o.detail ? `${o.label} · ${o.detail}` : o.label;
}
